import type { AuthorDeletedEvent } from "../books/events.js";
import type { DownloadFailedEvent } from "../download-tracking/events.js";
import { isTorrentInfo, type ReleaseInfo, type RemoteBook } from "../decision-engine/remoteBook.js";
import { DownloadProtocol } from "../indexers/DownloadProtocol.js";
import { IndexerFlags } from "../indexers/releaseInfo.js";
import { PagingSpec } from "../db/paging-spec.js";
import { newBlocklist, type Blocklist } from "./blocklist.js";
import type { IBlocklistRepository } from "./blocklistRepository.js";
import type { ClearBlocklistCommand } from "./clearBlocklistCommand.js";

/** 2 megabytes, matching C#'s `2.Megabytes()` extension (`NzbDrone.Common.Extensions`). */
const TWO_MEGABYTES = 2 * 1024 * 1024;

/**
 * Ported from `DateTime.Parse(message.Data.GetValueOrDefault("publishedDate"))`
 * -- see `handleDownloadFailed`'s doc comment: this faithfully throws when
 * the key is missing (C# `DateTime.Parse(null)` -> ArgumentNullException)
 * rather than defaulting, and also throws on an unparseable string (C#
 * `DateTime.Parse` throws `FormatException` for that case too).
 */
function parsePublishedDateOrThrow(value: string | undefined): string {
  if (value === undefined) {
    throw new TypeError("Value cannot be null. (Parameter 's')");
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`String '${value}' was not recognized as a valid DateTime.`);
  }
  return parsed.toISOString();
}

/**
 * Ported from `Enum.TryParse(message.Data.GetValueOrDefault("indexerFlags"),
 * true, out IndexerFlags flags)`: returns null (never throws) on a
 * missing/blank value, matching `TryParse`'s false-on-failure contract.
 * Accepts either a numeric string (the common case -- History's own
 * `EntityHistory.Data["IndexerFlags"]` writer stores `IndexerFlags.ToString()`
 * on a value with no matching named combination, which .NET renders as a
 * plain integer) or a case-insensitive flag *name* (the case `Enum.TryParse`
 * uniquely supports over a plain `Number()` parse, when `ToString()` finds a
 * single matching named value).
 */
function tryParseIndexerFlags(value: string | undefined): IndexerFlags | null {
  if (value == null || value.trim() === "") {
    return null;
  }

  const numeric = Number(value);
  if (!Number.isNaN(numeric) && value.trim() !== "") {
    return numeric;
  }

  const match = Object.entries(IndexerFlags).find(
    ([name]) => name.toLowerCase() === value.toLowerCase()
  );
  return match ? match[1] : null;
}

/**
 * Ported from NzbDrone.Core/Blocklisting/BlocklistService.cs.
 *
 * ## `ReleaseInfo`/`RemoteBook` type choice
 *
 * `IBlocklistService.Blocklisted(int authorId, ReleaseInfo release)` and
 * `Block(RemoteBook remoteEpisode, string message)` are both called by
 * DecisionEngine's real, already-merged `BlocklistSpecification`
 * (decision-engine/specifications/blocklistSpecification.ts), which declares
 * its own `BlocklistServiceLike { blocklisted(authorId, release):
 * boolean }` forward-ref against DecisionEngine's own `ReleaseInfo`/
 * `RemoteBook` types (decision-engine/remoteBook.ts). This class implements
 * that same interface directly (plus `blocklistedTorrentHash`, the slice
 * `download-clients/TorrentClientBase.ts`'s own, separate
 * `BlocklistServiceLike` forward-ref needs) using DecisionEngine's types --
 * NOT a third local forward-ref copy -- so a human reconciliation pass can
 * wire this class straight into both call sites' `blocklistService`
 * constructor parameters without an adapter. See this module's final report
 * for the two other forward-ref copies (`download-clients/
 * BlocklistServiceLike.ts`'s narrower `blocklistedTorrentHash`-only slice,
 * and `download-tracking/entityHistory.ts`'s unrelated History forward-ref)
 * that a reconciliation pass should also point at this module's real types.
 *
 * `IEventAggregator`/`IHandle<DownloadFailedEvent>`/
 * `IHandleAsync<AuthorDeletedEvent>` are ported as plain `handleXxx` methods
 * (matching `download-tracking/history/downloadHistoryService.ts`'s
 * established convention) rather than the real Messaging `IHandle<T>`
 * interfaces directly, since `Handle`/`HandleAsync` on the same class would
 * collide under TS's single-method-name-per-class rule the same way multiple
 * `IHandle<T>` implementations do elsewhere in this port.
 */
export interface IBlocklistService {
  blocklisted(authorId: number, release: ReleaseInfo): boolean;
  blocklistedTorrentHash(authorId: number, hash: string): boolean;
  paged(pagingSpec: PagingSpec<Blocklist>): PagingSpec<Blocklist>;
  block(remoteBook: RemoteBook, message: string): void;
  delete(id: number): void;
  deleteMany(ids: number[]): void;
}

export class BlocklistService implements IBlocklistService {
  constructor(private readonly blocklistRepository: IBlocklistRepository) {}

  blocklisted(authorId: number, release: ReleaseInfo): boolean {
    if (release.downloadProtocol === DownloadProtocol.Torrent) {
      if (!isTorrentInfo(release)) {
        return false;
      }

      if (release.infoHash != null && release.infoHash.trim() !== "") {
        const blocklistedByTorrentInfohash = this.blocklistRepository.blocklistedByTorrentInfoHash(
          authorId,
          release.infoHash
        );

        return blocklistedByTorrentInfohash.some((b) => this.sameTorrent(b, release));
      }

      return this.blocklistRepository
        .blocklistedByTitle(authorId, release.title)
        .filter((b) => b.protocol === DownloadProtocol.Torrent)
        .some((b) => this.sameTorrent(b, release));
    }

    return this.blocklistRepository
      .blocklistedByTitle(authorId, release.title)
      .filter((b) => b.protocol === DownloadProtocol.Usenet)
      .some((b) => this.sameNzb(b, release));
  }

  blocklistedTorrentHash(authorId: number, hash: string): boolean {
    return this.blocklistRepository
      .blocklistedByTorrentInfoHash(authorId, hash)
      .some((b) => b.torrentInfoHash?.toLowerCase() === hash.toLowerCase());
  }

  paged(pagingSpec: PagingSpec<Blocklist>): PagingSpec<Blocklist> {
    return this.blocklistRepository.getPaged(pagingSpec);
  }

  block(remoteBook: RemoteBook, message: string): void {
    const blocklist = newBlocklist({
      authorId: remoteBook.author.id,
      bookIds: remoteBook.books.map((b) => b.id),
      sourceTitle: remoteBook.release.title,
      quality: remoteBook.parsedBookInfo.quality,
      date: new Date().toISOString(),
      publishedDate: remoteBook.release.publishDate,
      size: remoteBook.release.size,
      indexer: remoteBook.release.indexer,
      protocol: remoteBook.release.downloadProtocol,
      message,
      torrentInfoHash: isTorrentInfo(remoteBook.release)
        ? (remoteBook.release.infoHash ?? null)
        : null,
    });

    this.blocklistRepository.insert(blocklist);
  }

  delete(id: number): void {
    this.blocklistRepository.delete(id);
  }

  deleteMany(ids: number[]): void {
    this.blocklistRepository.deleteMany(ids);
  }

  /**
   * Ported from `SameNzb`.
   *
   * FAITHFULLY PRESERVED QUIRK: the fallback branch's `!HasSameIndexer(item,
   * release.Indexer)` is negated -- it only matches when the release's
   * indexer is DIFFERENT from the stored blocklist entry's (or when the
   * stored entry has no indexer recorded at all, which `hasSameIndexer`
   * treats as "matches anything"), not when it's the same. This reads like
   * it could be an inverted-condition bug in the original (a "same release,
   * different indexer" match seems like an odd fallback for "is this the
   * same NZB"), but it's ported exactly as written -- see this module's
   * task instructions on preserving real C# bugs rather than fixing them.
   */
  private sameNzb(item: Blocklist, release: ReleaseInfo): boolean {
    if (item.publishedDate === release.publishDate) {
      return true;
    }

    if (
      !this.hasSameIndexer(item, release.indexer) &&
      this.hasSamePublishedDate(item, release.publishDate) &&
      this.hasSameSize(item, release.size)
    ) {
      return true;
    }

    return false;
  }

  private sameTorrent(
    item: Blocklist,
    release: ReleaseInfo & { infoHash?: string | null }
  ): boolean {
    if (release.infoHash != null && release.infoHash.trim() !== "") {
      return release.infoHash.toLowerCase() === (item.torrentInfoHash ?? "").toLowerCase();
    }

    return this.hasSameIndexer(item, release.indexer);
  }

  private hasSameIndexer(item: Blocklist, indexer: string | null | undefined): boolean {
    if (item.indexer == null || item.indexer.trim() === "") {
      return true;
    }

    return item.indexer.toLowerCase() === (indexer ?? "").toLowerCase();
  }

  /** Ported from `HasSamePublishedDate`: within a 2-minute window either side of the stored PublishedDate. */
  private hasSamePublishedDate(item: Blocklist, publishedDate: string): boolean {
    if (item.publishedDate == null) {
      return true;
    }

    const stored = new Date(item.publishedDate).getTime();
    const candidate = new Date(publishedDate).getTime();
    const twoMinutesMs = 2 * 60 * 1000;

    return stored - twoMinutesMs <= candidate && stored + twoMinutesMs >= candidate;
  }

  private hasSameSize(item: Blocklist, size: number): boolean {
    if (item.size == null) {
      return true;
    }

    const difference = Math.abs(item.size - size);

    return difference <= TWO_MEGABYTES;
  }

  /** Ported from `Execute(ClearBlocklistCommand message)`. */
  execute(_message: ClearBlocklistCommand): void {
    this.blocklistRepository.purge();
  }

  /** Ported from `Handle(DownloadFailedEvent message)`. */
  handleDownloadFailed(message: DownloadFailedEvent): void {
    const data = message.data;

    const blocklist = newBlocklist({
      authorId: message.authorId,
      bookIds: message.bookIds,
      sourceTitle: message.sourceTitle,
      quality: message.quality ?? undefined,
      date: new Date().toISOString(),
      // FAITHFULLY PRESERVED BUG: C#'s `DateTime.Parse(message.Data.
      // GetValueOrDefault("publishedDate"))` passes NO default to
      // GetValueOrDefault, so a missing "publishedDate" key returns C# null
      // and `DateTime.Parse(null)` throws ArgumentNullException -- this
      // handler crashes (uncaught, propagating out of the event dispatch)
      // whenever a DownloadFailedEvent's Data dictionary lacks that key.
      // parsePublishedDateOrThrow() below reproduces that crash-on-missing
      // behavior exactly rather than defensively defaulting to null.
      publishedDate: parsePublishedDateOrThrow(data["publishedDate"]),
      // `long.Parse(message.Data.GetValueOrDefault("size", "0"))` DOES pass
      // a "0" default, so a missing key parses to 0 without throwing.
      size: Number.parseInt(data["size"] ?? "0", 10),
      indexer: data["indexer"] ?? null,
      // `Convert.ToInt32(message.Data.GetValueOrDefault("protocol"))` on a
      // missing key converts C# null -> 0, matching `Number(undefined) || 0`.
      protocol: (Number(data["protocol"]) || 0) as DownloadProtocol,
      message: message.message,
      torrentInfoHash: data["torrentInfoHash"] ?? null,
    });

    const parsedFlags = tryParseIndexerFlags(data["indexerFlags"]);
    if (parsedFlags !== null) {
      blocklist.indexerFlags = parsedFlags;
    }

    this.blocklistRepository.insert(blocklist);
  }

  /** Ported from `HandleAsync(AuthorDeletedEvent message)`. */
  handleAuthorDeleted(message: AuthorDeletedEvent): void {
    const blocklisted = this.blocklistRepository.blocklistedByAuthor(message.author.id);

    this.blocklistRepository.deleteMany(blocklisted);
  }
}

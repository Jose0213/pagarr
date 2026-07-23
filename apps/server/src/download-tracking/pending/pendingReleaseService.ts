import { createHash } from "node:crypto";
import type { Author, Book } from "../../books/models.js";
import type { AuthorDeletedEvent } from "../../books/events.js";
import type { IConfigService } from "../../config/configService.js";
import { getProtocolDelay, type DelayProfile } from "../../profiles/delay/delayProfile.js";
import { DownloadProtocol } from "../../indexers/DownloadProtocol.js";
import {
  asQualityProfileLike,
  type QualityProfile,
} from "../../profiles/qualities/qualityProfile.js";
import { QualityModelComparer } from "../../qualities/qualityModelComparer.js";
import { DownloadDecision } from "../../decision-engine/downloadDecision.js";
import type { RemoteBook as DecisionRemoteBook } from "../../decision-engine/remoteBook.js";
import type { ParsedBookInfo } from "../../parser/model/parsedBookInfo.js";
import type { ReleaseInfo } from "../../parser/model/releaseInfo.js";
import { newRemoteBook, type RemoteBook } from "../../parser/model/remoteBook.js";
import type { IRemoteBookAggregationService } from "../aggregation/remoteBookAggregationService.js";
import type { QueueItem } from "../queueItem.js";
import type { PendingRelease } from "./pendingRelease.js";
import { PendingReleaseReason } from "./pendingReleaseReason.js";
import type { IPendingReleaseRepository } from "./pendingReleaseRepository.js";

/**
 * Ported from NzbDrone.Core/Download/Pending/PendingReleaseService.cs.
 *
 * DEVIATIONS (constructor-injection style per this port's established
 * "narrow collaborator interfaces, not the full concrete class" pattern,
 * matching e.g. tags/tagService.ts's TagUsageProviders):
 *
 *  - `IIndexerStatusService.GetBlockedProviders()` -- injected as
 *    `getBlockedIndexerIds(): Set<number>` (the real
 *    `indexers/IndexerStatusService.ts` already returns the same shape
 *    DecisionEngine specs consume; narrowed to just the ids this method
 *    reads).
 *  - `IAuthorService.GetAuthors(IEnumerable<int>)` -- injected as
 *    `getAuthors(authorIds: number[]): Author[]`, matching
 *    `books/authorService.ts`'s real `getAuthors` signature.
 *  - `IParsingService.GetBooks(...)` -- injected as `getBooks(...)`,
 *    matching `parser/parsingService.ts`'s real `ParsingService.getBooks`.
 *  - `IDelayProfileService` -- injected as the real
 *    `profiles/delay/delayProfileService.ts`'s `DelayProfileService`
 *    (`allForTags`/`bestForTags` match the C# names 1:1).
 *  - `IConfigService` -- the real, ported `config/configService.ts`.
 *  - `ICustomFormatCalculationService.ParseCustomFormat(RemoteBook, long)`
 *    -- injected as `parseCustomFormat(remoteBook, size): unknown[]`,
 *    matching `custom-formats/customFormatCalculationService.ts`'s
 *    `parseCustomFormatForRemoteBook` shape (return value intentionally
 *    unused here beyond assignment, same as the C# source which just
 *    stores it onto `RemoteBook.CustomFormats`).
 *  - `IRemoteBookAggregationService` -- the real, ported
 *    `download-tracking/aggregation/remoteBookAggregationService.ts`.
 *  - `IDownloadClientFactory.Find(id)` / `IIndexerFactory.Find(id)` --
 *    injected as narrow `{ find(id): T | undefined }` lookups (matching
 *    `indexers/IndexerRepository.ts`'s real `IIndexerRepository.find`
 *    shape for indexers; download-clients isn't merged yet, see
 *    `downloadClients.ts`'s forward-ref doc comment, so
 *    `downloadClientLookup` is typed against a minimal `{ id: number; name:
 *    string }` shape).
 *  - `ITaskManager.GetNextExecution(typeof(RssSyncCommand))` -- Scheduling
 *    (Phase 4, Jobs/Messaging) isn't ported; injected as a
 *    `getNextRssSyncTime(): string` callback (ISO 8601), defaulting to
 *    "now" (i.e. assume the next RSS sync is imminent) when omitted --
 *    matches this port's "Messaging not ported yet, use a callback seam"
 *    convention (root-folders/root-folder-service.ts).
 *  - `IEventAggregator` -- a plain optional `onPendingReleasesUpdated`
 *    callback, matching config/configService.ts's `onConfigSaved` pattern
 *    (PendingReleasesUpdatedEvent carries no data, so the callback needs no
 *    argument).
 *  - No NLog `Logger` -- per this port's no-NLog-yet convention.
 *
 * `RemoteBook` here is Parser's real, ported type (not DecisionEngine's
 * forward-ref) -- `PendingRelease.RemoteBook`/`ParsingService.GetBooks`/
 * `RemoteBookAggregationService.Augment` are all real
 * `NzbDrone.Core.Parser.Model.RemoteBook` in the C# source, per this
 * module's task instructions to import Parser types directly. `Add`/
 * `AddMany` take DecisionEngine's real, ported `DownloadDecision` (whose
 * `.remoteBook` is DecisionEngine's own forward-ref `RemoteBook`) --
 * `insertFromDecision` below bridges the two shapes at the one point they
 * meet, matching what the real C# `Insert(DownloadDecision decision, ...)`
 * does (reads fields off `decision.RemoteBook` to build a new
 * `Parser.Model.RemoteBook`-shaped `PendingRelease`).
 */

export interface IndexerStatusLookup {
  getBlockedIndexerIds(): Set<number>;
}

export interface AuthorLookup {
  getAuthors(authorIds: number[]): Author[];
}

export interface BookLookup {
  getBooks(parsedBookInfo: ParsedBookInfo, author: Author): Book[];
}

export interface DownloadClientNameLookup {
  find(id: number): { id: number; name: string } | undefined;
}

export interface IndexerLookup {
  find(id: number): { id: number; downloadClientId: number } | undefined;
}

export interface PendingReleaseCustomFormatCalculatorLike {
  parseCustomFormatForRemoteBook(
    remoteBook: {
      parsedBookInfo: ParsedBookInfo | null;
      author: Author;
      release?: { indexerFlags?: number } | null;
    },
    size: number
  ): unknown[];
}

export interface PendingReleaseServiceDeps {
  getNextRssSyncTime?: () => string;
  onPendingReleasesUpdated?: () => void;
}

export class PendingReleaseService {
  private readonly getNextRssSyncTime: () => string;
  private readonly onPendingReleasesUpdated: () => void;

  constructor(
    private readonly indexerStatusService: IndexerStatusLookup,
    private readonly repository: IPendingReleaseRepository,
    private readonly authorService: AuthorLookup,
    private readonly bookLookup: BookLookup,
    private readonly delayProfileService: {
      allForTags(tagIds: Set<number>): DelayProfile[];
      bestForTags(tagIds: Set<number>): DelayProfile;
    },
    private readonly configService: IConfigService,
    private readonly formatCalculator: PendingReleaseCustomFormatCalculatorLike,
    private readonly aggregationService: IRemoteBookAggregationService,
    private readonly downloadClientLookup: DownloadClientNameLookup,
    private readonly indexerLookup: IndexerLookup,
    deps: PendingReleaseServiceDeps = {}
  ) {
    this.getNextRssSyncTime = deps.getNextRssSyncTime ?? (() => new Date().toISOString());
    this.onPendingReleasesUpdated = deps.onPendingReleasesUpdated ?? (() => {});
  }

  add(decision: DownloadDecision, reason: PendingReleaseReason): void {
    this.addMany([[decision, reason]]);
  }

  /** Ported from `AddMany(List<Tuple<DownloadDecision, PendingReleaseReason>> decisions)`. */
  addMany(decisions: [DownloadDecision, PendingReleaseReason][]): void {
    const byAuthor = new Map<number, [DownloadDecision, PendingReleaseReason][]>();
    for (const pair of decisions) {
      const authorId = pair[0].remoteBook.author.id;
      const group = byAuthor.get(authorId);
      if (group) {
        group.push(pair);
      } else {
        byAuthor.set(authorId, [pair]);
      }
    }

    for (const authorDecisions of byAuthor.values()) {
      let alreadyPending = this.repository.allByAuthorId(
        authorDecisions[0]![0].remoteBook.author.id
      );

      const knownRemoteBooks = new Map<string, DecisionRemoteBook>();
      for (const [decision] of authorDecisions) {
        knownRemoteBooks.set(decision.remoteBook.release.title, decision.remoteBook);
      }

      const included = this.includeRemoteBooks(alreadyPending, knownRemoteBooks);
      alreadyPending = included ?? [];
      let alreadyPendingByBook = createBookLookup(alreadyPending);

      for (const [decision, reason] of authorDecisions) {
        const bookIds = decision.remoteBook.books.map((e) => e.id);

        const existingReports = Array.from(
          new Set(bookIds.flatMap((id) => alreadyPendingByBook.get(id) ?? []))
        );

        const matchingReports = existingReports.filter(
          matchingReleasePredicate(decision.remoteBook.release)
        );

        if (matchingReports.length > 0) {
          const matchingReport = matchingReports[0]!;

          if (matchingReport.reason !== reason) {
            if (matchingReport.reason !== PendingReleaseReason.DownloadClientUnavailable) {
              matchingReport.reason = reason;
              this.repository.update(matchingReport);
            }
          }

          if (matchingReports.length > 1) {
            for (const duplicate of matchingReports.slice(1)) {
              this.repository.delete(duplicate.id);
              const idx = alreadyPending.indexOf(duplicate);
              if (idx !== -1) {
                alreadyPending.splice(idx, 1);
              }
              alreadyPendingByBook = createBookLookup(alreadyPending);
            }
          }

          continue;
        }

        this.insertFromDecision(decision, reason);
      }
    }
  }

  /** Ported from `GetPending()`. */
  getPending(): ReleaseInfo[] {
    let releases: ReleaseInfo[] = this.repository.all().map((p) => {
      const release: ReleaseInfo = {
        ...p.release,
        pendingReleaseReason: PendingReleaseReason[p.reason] ?? null,
      };
      return release;
    });

    if (releases.length > 0) {
      releases = this.filterBlockedIndexers(releases);
    }

    return releases;
  }

  /** Ported from `GetPendingRemoteBooks(int authorId)`. */
  getPendingRemoteBooks(authorId: number): RemoteBook[] {
    const included = this.includeRemoteBooks(this.repository.allByAuthorId(authorId));
    return (included ?? []).map((v) => v.remoteBook!).filter((r): r is RemoteBook => r !== null);
  }

  /** Ported from `GetPendingQueue()`. */
  getPendingQueue(): QueueItem[] {
    const queued: QueueItem[] = [];

    const nextRssSync = new Date(this.getNextRssSyncTime());

    const pendingReleases = this.includeRemoteBooks(this.repository.withoutFallback()) ?? [];

    for (const pendingRelease of pendingReleases) {
      const remoteBook = pendingRelease.remoteBook;
      if (remoteBook === null || remoteBook.author === null) {
        continue;
      }

      for (const book of remoteBook.books) {
        const publishDate = new Date(remoteBook.release!.publishDate);
        let ect = new Date(publishDate.getTime() + this.getDelay(remoteBook) * 60_000);

        if (ect < nextRssSync) {
          ect = nextRssSync;
        } else {
          ect = new Date(ect.getTime() + this.configService.rssSyncInterval * 60_000);
        }

        let timeleftMs = ect.getTime() - Date.now();
        if (timeleftMs < 0) {
          timeleftMs = 0;
        }

        let downloadClientName: string | null = null;
        const indexer = this.indexerLookup.find(remoteBook.release!.indexerId);

        if (indexer !== undefined && indexer.downloadClientId > 0) {
          const downloadClient = this.downloadClientLookup.find(indexer.downloadClientId);
          downloadClientName = downloadClient?.name ?? null;
        }

        queued.push({
          id: getQueueId(pendingRelease, book),
          author: remoteBook.author,
          book,
          quality: remoteBook.parsedBookInfo?.quality ?? null,
          size: remoteBook.release!.size,
          title: pendingRelease.title,
          sizeleft: remoteBook.release!.size,
          timeleftMs,
          estimatedCompletionTime: ect.toISOString(),
          status: PendingReleaseReason[pendingRelease.reason],
          trackedDownloadStatus: null,
          trackedDownloadState: null,
          statusMessages: [],
          downloadId: null,
          remoteBook,
          protocol: parseDownloadProtocolString(remoteBook.release!.downloadProtocol),
          downloadClient: downloadClientName,
          downloadClientHasPostImportCategory: false,
          indexer: remoteBook.release!.indexer,
          outputPath: null,
          errorMessage: null,
          downloadForced: false,
        });
      }
    }

    // Return best quality release for each book.
    const byBook = new Map<number, QueueItem[]>();
    for (const q of queued) {
      const list = byBook.get(q.book.id);
      if (list) {
        list.push(q);
      } else {
        byBook.set(q.book.id, [q]);
      }
    }

    const deduped: QueueItem[] = [];
    for (const group of byBook.values()) {
      const author = group[0]!.author;
      const profile = (author as unknown as { qualityProfile?: QualityProfile }).qualityProfile;
      const comparer = profile ? new QualityModelComparer(asQualityProfileLike(profile)) : null;

      const sorted = [...group].sort((a, b) => {
        if (comparer && a.quality && b.quality) {
          const qualityCompare = comparer.compare(b.quality, a.quality);
          if (qualityCompare !== 0) {
            return qualityCompare;
          }
        }
        return (
          this.prioritizeDownloadProtocol(author, a.protocol) -
          this.prioritizeDownloadProtocol(author, b.protocol)
        );
      });

      deduped.push(sorted[0]!);
    }

    return deduped;
  }

  findPendingQueueItem(queueId: number): QueueItem | undefined {
    const matches = this.getPendingQueue().filter((p) => p.id === queueId);
    if (matches.length > 1) {
      throw new Error("Sequence contains more than one matching element");
    }
    return matches[0];
  }

  /** Ported from `RemovePendingQueueItems(int queueId)`. */
  removePendingQueueItems(queueId: number): void {
    const targetItem = this.findPendingRelease(queueId);
    const authorReleases = this.repository.allByAuthorId(targetItem.authorId);

    const releasesToRemove = authorReleases.filter(
      (c) => c.parsedBookInfo.bookTitle === targetItem.parsedBookInfo.bookTitle
    );

    this.repository.deleteMany(releasesToRemove.map((c) => c.id));
  }

  /** Ported from `OldestPendingRelease(int authorId, int[] bookIds)`. */
  oldestPendingRelease(authorId: number, bookIds: number[]): RemoteBook | undefined {
    const authorReleases = this.getPendingReleasesForAuthor(authorId);
    const bookIdSet = new Set(bookIds);

    const candidates = authorReleases
      .map((r) => r.remoteBook)
      .filter((r): r is RemoteBook => r !== null && r.books.some((e) => bookIdSet.has(e.id)));

    if (candidates.length === 0) {
      return undefined;
    }

    return candidates.reduce((oldest, current) =>
      releaseAgeHours(current) > releaseAgeHours(oldest) ? current : oldest
    );
  }

  private filterBlockedIndexers(releases: ReleaseInfo[]): ReleaseInfo[] {
    const blockedIndexers = this.indexerStatusService.getBlockedIndexerIds();
    return releases.filter((release) => !blockedIndexers.has(release.indexerId));
  }

  private getPendingReleasesAll(): PendingRelease[] {
    return this.includeRemoteBooks(this.repository.all()) ?? [];
  }

  private getPendingReleasesForAuthor(authorId: number): PendingRelease[] {
    return this.includeRemoteBooks(this.repository.allByAuthorId(authorId)) ?? [];
  }

  /**
   * Ported from `IncludeRemoteBooks`. Returns `null` (matching C#'s `return
   * null` inside the loop) if any release's author can't be resolved (i.e.
   * has been removed but not yet housekept).
   */
  private includeRemoteBooks(
    releases: PendingRelease[],
    knownRemoteBooks?: Map<string, DecisionRemoteBook>
  ): PendingRelease[] | null {
    const result: PendingRelease[] = [];
    const authorMap = new Map<number, Author>();

    if (knownRemoteBooks) {
      for (const decisionRemoteBook of knownRemoteBooks.values()) {
        const author = decisionRemoteBook.author as unknown as Author;
        if (!authorMap.has(author.id)) {
          authorMap.set(author.id, author);
        }
      }
    }

    const missingAuthorIds = Array.from(new Set(releases.map((v) => v.authorId))).filter(
      (id) => !authorMap.has(id)
    );

    for (const author of this.authorService.getAuthors(missingAuthorIds)) {
      authorMap.set(author.id, author);
    }

    for (const release of releases) {
      const author = authorMap.get(release.authorId);

      // Just in case the author was removed, but wasn't cleaned up yet
      // (housekeeper will clean it up).
      if (author === undefined) {
        return null;
      }

      let books: Book[];
      const known =
        release.release.title !== null ? knownRemoteBooks?.get(release.release.title) : undefined;
      if (known !== undefined) {
        books = known.books;
      } else {
        books = this.bookLookup.getBooks(release.parsedBookInfo, author);
      }

      const remoteBook: RemoteBook = {
        ...newRemoteBook(),
        author,
        books,
        releaseSource: release.additionalInfo?.releaseSource ?? 0,
        parsedBookInfo: release.parsedBookInfo,
        release: release.release,
      };

      this.aggregationService.augment(remoteBook);
      this.formatCalculator.parseCustomFormatForRemoteBook(
        { ...remoteBook, author },
        release.release.size
      );

      result.push({ ...release, remoteBook });
    }

    return result;
  }

  /**
   * Ported from the private `Insert(DownloadDecision decision,
   * PendingReleaseReason reason)`.
   *
   * GAP: DecisionEngine's forward-ref `ParsedBookInfo`/`ReleaseInfo`
   * (decision-engine/remoteBook.ts) are structurally narrower than Parser's
   * real, ported types (`parser/model/parsedBookInfo.ts`/`releaseInfo.ts`)
   * -- see this module's header comment on the DecisionEngine/Parser
   * `RemoteBook` split. `parsedBookInfoFromDecision`/`releaseInfoFromDecision`
   * below fill in the fields DecisionEngine's narrower shapes don't carry
   * with sensible defaults (empty/unset), matching how a freshly-parsed
   * `ParsedBookInfo`/`ReleaseInfo` from this port's own Parser module
   * defaults those same fields (see parser/model/*.ts's `new*()` factories).
   * When DecisionEngine's types are reconciled with Parser's real ones
   * (flagged as future work in decision-engine/remoteBook.ts's own header
   * comment), these adapter functions become unnecessary.
   */
  private insertFromDecision(decision: DownloadDecision, reason: PendingReleaseReason): void {
    const release = releaseInfoFromDecision(decision.remoteBook.release);

    const inserted = this.repository.insert({
      id: 0,
      authorId: decision.remoteBook.author.id,
      parsedBookInfo: parsedBookInfoFromDecision(decision.remoteBook.parsedBookInfo),
      release,
      title: release.title ?? "",
      added: new Date().toISOString(),
      reason,
      additionalInfo: { releaseSource: decision.remoteBook.releaseSource },
      remoteBook: null,
    });
    void inserted;

    this.onPendingReleasesUpdated();
  }

  private deletePendingRelease(pendingRelease: PendingRelease): void {
    this.repository.delete(pendingRelease);
    this.onPendingReleasesUpdated();
  }

  /** Ported from the private `GetDelay(RemoteBook remoteBook)`. */
  private getDelay(remoteBook: RemoteBook): number {
    const tags = new Set(remoteBook.author?.tags ?? []);
    const sorted = this.delayProfileService
      .allForTags(tags)
      .slice()
      .sort((a, b) => a.order - b.order);
    const delayProfile = sorted[0];
    if (!delayProfile) {
      throw new Error("Sequence contains no elements");
    }
    const protocol = parseDownloadProtocolString(remoteBook.release!.downloadProtocol);
    const delay = getProtocolDelay(delayProfile, toDelayProfileProtocol(protocol));
    const minimumAge = this.configService.minimumAge;
    return Math.max(delay, minimumAge);
  }

  /** Ported from the private `RemoveGrabbed(RemoteBook remoteBook)`. Public per this module's task scope (`BookGrabbedEvent` handler). */
  removeGrabbed(remoteBook: DecisionRemoteBook): void {
    const pendingReleases = this.getPendingReleasesForAuthor(remoteBook.author.id);
    const bookIds = new Set(remoteBook.books.map((e) => e.id));

    const existingReports = pendingReleases.filter(
      (r) => r.remoteBook !== null && r.remoteBook.books.some((e) => bookIds.has(e.id))
    );

    if (existingReports.length === 0) {
      return;
    }

    const profile = remoteBook.author.qualityProfile;

    for (const existingReport of existingReports) {
      const compare = new QualityModelComparer(asQualityProfileLike(profile)).compare(
        remoteBook.parsedBookInfo.quality,
        existingReport.remoteBook!.parsedBookInfo!.quality!
      );

      // Only remove lower/equal quality pending releases. It's safer to
      // retry these releases on the next round than remove and re-add.
      if (compare >= 0) {
        this.deletePendingRelease(existingReport);
      }
    }
  }

  /** Ported from the private `RemoveRejected(List<DownloadDecision> rejected)`. Public per this module's task scope (`RssSyncCompleteEvent` handler). */
  removeRejected(rejected: DownloadDecision[]): void {
    const pending = this.getPendingReleasesAll();

    for (const rejectedRelease of rejected) {
      const matching = pending.filter(matchingReleasePredicate(rejectedRelease.remoteBook.release));

      for (const pendingRelease of matching) {
        this.deletePendingRelease(pendingRelease);
      }
    }
  }

  private findPendingRelease(queueId: number): PendingRelease {
    const found = this.getPendingReleasesAll().find(
      (p) => p.remoteBook !== null && p.remoteBook.books.some((e) => queueId === getQueueId(p, e))
    );
    if (!found) {
      throw new Error("Sequence contains no matching element");
    }
    return found;
  }

  /** Ported from the private `PrioritizeDownloadProtocol(Author author, DownloadProtocol downloadProtocol)`. */
  private prioritizeDownloadProtocol(author: Author, downloadProtocol: DownloadProtocol): number {
    const tags = new Set(author.tags);
    const delayProfile = this.delayProfileService.bestForTags(tags);
    return toDelayProfileProtocol(downloadProtocol) === delayProfile.preferredProtocol ? 0 : 1;
  }

  handleAuthorDeleted(message: AuthorDeletedEvent): void {
    this.repository.deleteByAuthorId(message.author.id);
  }

  handleBookGrabbed(book: DecisionRemoteBook): void {
    this.removeGrabbed(book);
  }

  handleRssSyncComplete(rejected: DownloadDecision[]): void {
    this.removeRejected(rejected);
  }
}

/** Ported from the private `CreateBookLookup(IEnumerable<PendingRelease> alreadyPending)`: `ILookup<int, PendingRelease>` stand-in as a `Map<number, PendingRelease[]>`. */
function createBookLookup(alreadyPending: PendingRelease[]): Map<number, PendingRelease[]> {
  const lookup = new Map<number, PendingRelease[]>();
  for (const pending of alreadyPending) {
    if (pending.remoteBook === null) {
      continue;
    }
    for (const book of pending.remoteBook.books) {
      const list = lookup.get(book.id);
      if (list) {
        list.push(pending);
      } else {
        lookup.set(book.id, [pending]);
      }
    }
  }
  return lookup;
}

/**
 * Ported from the private static `MatchingReleasePredicate(ReleaseInfo
 * release)`. Typed against a minimal structural shape (not the full
 * `ReleaseInfo`) since this is called with releases from both DecisionEngine's
 * `RemoteBook.release` (`addMany`/`removeRejected`, real fields:
 * title/publishDate/indexer are non-null there) and would need to compare
 * against Parser's `PendingRelease.release` (nullable fields) -- only the
 * three fields the C# original actually compares are required here.
 */
function matchingReleasePredicate(release: {
  title: string | null;
  publishDate: string;
  indexer: string | null;
}): (p: PendingRelease) => boolean {
  return (p) =>
    p.title === release.title &&
    p.release.publishDate === release.publishDate &&
    p.release.indexer === release.indexer;
}

/**
 * Parser's real `ReleaseInfo.downloadProtocol` is a `string | null`
 * placeholder (see parser/model/releaseInfo.ts's doc comment: it's kept as
 * a narrow string placeholder pending Indexers -- which has since landed
 * for real, but Parser's own field wasn't widened along with it). Converts
 * that placeholder string (a `DownloadProtocol` enum member's numeric value
 * serialized as a string, e.g. `"1"`, OR left `null`/unset) to the real
 * `indexers/DownloadProtocol.ts` enum, defaulting to `Unknown` for anything
 * unparseable -- matching this port's convention of defaulting an
 * unrecognized/missing protocol to `Unknown` rather than throwing (see
 * `indexers/releaseInfo.ts` and callers elsewhere in this port that treat
 * `Unknown` as the safe fallback).
 */
function parseDownloadProtocolString(raw: string | null): DownloadProtocol {
  if (raw === null) {
    return DownloadProtocol.Unknown;
  }
  const parsed = Number.parseInt(raw, 10);
  if (parsed === DownloadProtocol.Usenet || parsed === DownloadProtocol.Torrent) {
    return parsed;
  }
  return DownloadProtocol.Unknown;
}

/**
 * `indexers/DownloadProtocol.ts` (the real, canonical DownloadProtocol,
 * imported directly per this module's task instructions) and
 * `profiles/delay/delayProfile.ts`'s locally-declared `DownloadProtocol`
 * (documented there as a stand-in for the same C# enum, predating this
 * module) are two distinct TS type declarations with identical underlying
 * values (Unknown=0, Usenet=1, Torrent=2) -- see
 * profiles/delay/delayProfile.ts's doc comment. TS structurally widens the
 * real `indexers/DownloadProtocol.ts` (a plain `0 | 1 | 2` numeric-literal
 * union, not a nominal `enum`) into any numeric enum sharing those same
 * literal values without a cast, so no runtime conversion is needed here --
 * this named function exists purely so the one call site that crosses the
 * two modules' type boundary reads as an explicit, documented conversion
 * (matching the intent of `decision-engine/remoteBook.ts`'s header comment
 * on its own DownloadProtocol reconciliation) rather than an unexplained
 * bare value.
 */
function toDelayProfileProtocol(
  protocol: DownloadProtocol
): import("../../profiles/delay/delayProfile.js").DownloadProtocol {
  return protocol;
}

/**
 * Adapts DecisionEngine's forward-ref `ParsedBookInfo` to Parser's real,
 * ported `ParsedBookInfo` -- see `insertFromDecision`'s doc comment. Fields
 * DecisionEngine's narrower shape doesn't carry (`bookTitle` as a plain
 * string -- DecisionEngine allows `string | string[]`, `authorTitleInfo`,
 * `discographyStart`/`End`, `releaseVersion`, `releaseTitle`) default the
 * same way `parser/model/parsedBookInfo.ts`'s `newParsedBookInfo()` does.
 */
function parsedBookInfoFromDecision(
  info: import("../../decision-engine/remoteBook.js").ParsedBookInfo
): ParsedBookInfo {
  return {
    bookTitle: Array.isArray(info.bookTitle)
      ? (info.bookTitle[0] ?? null)
      : (info.bookTitle ?? null),
    authorName: info.authorName,
    authorTitleInfo: null,
    quality: info.quality,
    releaseDate: info.releaseDate ?? null,
    discography: info.discography,
    discographyStart: info.discographyStart ?? 0,
    discographyEnd: info.discographyEnd ?? 0,
    releaseGroup: info.releaseGroup ?? null,
    releaseHash: info.releaseHash ?? null,
    releaseVersion: info.releaseVersion ?? null,
    releaseTitle: info.releaseTitle ?? null,
  };
}

/**
 * Adapts DecisionEngine's forward-ref `ReleaseInfo` to Parser's real,
 * ported `ReleaseInfo` -- see `insertFromDecision`'s doc comment. Fields
 * DecisionEngine's narrower shape doesn't carry (`languages`,
 * `indexerFlags`, `pendingReleaseReason`) default the same way
 * `parser/model/releaseInfo.ts`'s `newReleaseInfo()` does.
 */
function releaseInfoFromDecision(
  release: import("../../decision-engine/remoteBook.js").ReleaseInfo
): ReleaseInfo {
  return {
    guid: release.guid,
    title: release.title,
    size: release.size,
    downloadUrl: release.downloadUrl,
    infoUrl: release.infoUrl ?? null,
    commentUrl: release.commentUrl ?? null,
    indexerId: release.indexerId,
    indexer: release.indexer,
    author: release.author ?? null,
    book: release.book ?? null,
    indexerPriority: release.indexerPriority,
    // Parser's real ReleaseInfo.downloadProtocol is a `string | null`
    // placeholder (see parseDownloadProtocolString's doc comment above for
    // why); stringify the numeric enum value the same way
    // parseDownloadProtocolString expects to parse it back.
    downloadProtocol: String(release.downloadProtocol),
    publishDate: release.publishDate,
    origin: release.origin ?? null,
    source: release.source ?? null,
    container: release.container ?? null,
    codec: release.codec ?? null,
    categories: release.categories ?? null,
    languages: [],
    indexerFlags: 0 as import("../../parser/model/releaseInfo.js").IndexerFlags,
    pendingReleaseReason: null,
  };
}

/** Ported from `HashConverter.GetHashInt31(string target)`: SHA1 hash, first 4 bytes read as a big-endian int32, masked to 31 bits (matches C#'s `BitConverter.ToInt32` on a little-endian host & 0x7fffffff -- .NET's BitConverter is host-endian, and all realistic deployment targets for this port are little-endian x86/ARM, matching Node's default). */
function getHashInt31(target: string): number {
  const hash = createHash("sha1").update(target, "latin1").digest();
  return hash.readInt32LE(0) & 0x7fffffff;
}

/** Ported from the private `GetQueueId(PendingRelease pendingRelease, Book book)`. */
function getQueueId(pendingRelease: PendingRelease, book: Book): number {
  return getHashInt31(`pending-${pendingRelease.id}-book${book.id}`);
}

/** Ported from `ReleaseInfo.AgeHours` as applied to `RemoteBook.Release` in `OldestPendingRelease`'s `MaxBy`. */
function releaseAgeHours(remoteBook: RemoteBook): number {
  if (!remoteBook.release) {
    return 0;
  }
  return (Date.now() - new Date(remoteBook.release.publishDate).getTime()) / (60 * 60 * 1000);
}

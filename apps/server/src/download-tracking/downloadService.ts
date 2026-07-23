import type { RemoteBook } from "../decision-engine/remoteBook.js";
import { PendingReleaseReason } from "./pending/pendingReleaseReason.js";
import { BookGrabbedEvent } from "./bookGrabbedEvent.js";
import { HttpUri } from "../http/HttpUri.js";
import type { IRateLimitService } from "../http/RateLimitService.js";
import {
  DownloadClientRejectedReleaseException,
  DownloadClientUnavailableException,
  ReleaseBlockedException,
  ReleaseDownloadException,
  ReleaseUnavailableException,
  TooManyRequestsException,
  type IDownloadClientStatusService,
  type IProvideDownloadClient,
  type IndexerLike,
} from "./downloadClients.js";
import type { RemoteBookLike } from "../download-clients/RemoteBookLike.js";
import type { ReleaseInfo as IndexersReleaseInfo } from "../indexers/releaseInfo.js";
import type { IDownloadSeedConfigProvider } from "./downloadSeedConfigProvider.js";

/**
 * Ported from NzbDrone.Core/Download/DownloadService.cs. Uses
 * DecisionEngine's real, ported `RemoteBook` (not Parser's) throughout --
 * `DownloadReport` is called by `ProcessDownloadDecisions` with
 * `decision.RemoteBook`, and publishes a `BookGrabbedEvent` whose `.book`
 * is typed against the same DecisionEngine `RemoteBook` (see
 * bookGrabbedEvent.ts's doc comment) -- per this module's task instructions
 * to import DecisionEngine's real, ported `DownloadDecision` (and by
 * extension its `RemoteBook`) directly.
 *
 * `_indexerFactory.Get(id)` / `GetInstance(definition)` (`IIndexerFactory`)
 * -- narrowed to a plain `{ get(indexerId): IndexerLike | undefined }`
 * lookup, since `DownloadReport` only ever passes the resolved `IIndexer`
 * through to `downloadClient.Download(remoteBook, indexer)` (this module's
 * `IDownloadClient.download` forward-ref, see downloadClients.ts) without
 * calling anything else on it.
 *
 * `ISeedConfigProvider` here is `IDownloadSeedConfigProvider`
 * (downloadSeedConfigProvider.ts, this module's own real port of
 * NzbDrone.Core/Download/DownloadSeedConfigProvider.cs) -- NOT
 * `indexers/SeedConfigProvider.ts`'s `ISeedConfigProvider`. The real C#
 * `DownloadService` constructor takes `ISeedConfigProvider
 * seedConfigProvider` typed as `NzbDrone.Core.Indexers.ISeedConfigProvider`,
 * but the method it actually calls -- `GetSeedConfiguration(RemoteBook)` --
 * only exists on `NzbDrone.Core.Download.DownloadSeedConfigProvider`'s own
 * `IDownloadSeedConfigProvider` interface (a DIFFERENT interface, despite
 * both having a same-shaped `GetSeedConfiguration` overload -- `Indexers`'
 * `ISeedConfigProvider.GetSeedConfiguration` takes a narrow
 * `RemoteBookSeedInfo`-shaped shim, `Download`'s
 * `IDownloadSeedConfigProvider.GetSeedConfiguration` takes a bare
 * `string infoHash`). Since `RemoteBook.SeedConfiguration =
 * _seedConfigProvider.GetSeedConfiguration(remoteBook)` in the real source
 * resolves to the `Download` one via C#'s DI container (it's the only type
 * in the app satisfying the constructor's actual usage), this port wires
 * the real `IDownloadSeedConfigProvider` from `downloadSeedConfigProvider.ts`
 * directly -- but that class's real method takes an info hash string, not a
 * `RemoteBook`, so `remoteBook.parsedBookInfo.releaseHash` (the closest
 * analogue to an info hash on hand at this call site) is passed through.
 * DecisionEngine's `RemoteBook` (used here) has no `seedConfiguration` field
 * at all (see decision-engine/remoteBook.ts's doc comment: "SeedConfiguration
 * ... is omitted -- no DecisionEngine specification reads it"), so this
 * call's result -- like the real C# assignment -- has no further consumer
 * in this port yet; kept purely for the seeding-lookup side effect
 * (`getLatestGrab`/`fetchIndexer` inside DownloadSeedConfigProvider), which
 * has no observable effect here but preserves call-order fidelity with the
 * C# source.
 *
 * GAP: `ReleaseInfo.PendingReleaseReason` (`[JsonIgnore] public
 * PendingReleaseReason PendingReleaseReason`, set by
 * `PendingReleaseService.GetPending()` -- see pendingReleaseService.ts's
 * `getPending()`, which stamps it onto Parser's real `ReleaseInfo`) has no
 * equivalent field on DecisionEngine's forward-ref `ReleaseInfo`
 * (decision-engine/remoteBook.ts) -- that type predates Pending/Download
 * entirely and was never extended with this field since DecisionEngine
 * itself never reads it. Since this module cannot modify files outside
 * `download-tracking/` (per its task constraints), `filterBlockedClients`
 * below reads it via a local structural intersection
 * (`ReleaseWithPendingReason`) rather than widening the real
 * `decision-engine/remoteBook.ts` type -- a caller that re-grabs a
 * `PendingRelease` through `ProcessDownloadDecisions` would need to
 * populate this same way. When DecisionEngine's `RemoteBook`/`ReleaseInfo`
 * are reconciled with Parser's real types (flagged as future work in
 * decision-engine/remoteBook.ts's own header comment), this local
 * augmentation should be deleted in favor of the real field.
 */
export interface ReleaseWithPendingReason {
  /** String enum-member-name form, matching how `PendingReleaseService.getPending()` stamps it onto Parser's real `ReleaseInfo.pendingReleaseReason: string | null`. */
  pendingReleaseReason?: string | null;
}

/**
 * Adapts DecisionEngine's forward-ref `RemoteBook.release` (this module's
 * `RemoteBook` -- see class doc comment for why it's DecisionEngine's, not
 * Parser's) to `indexers/releaseInfo.ts`'s real `ReleaseInfo`, the type
 * `download-clients/RemoteBookLike.ts`'s `RemoteBookLike.release` actually
 * requires. Same gap/approach as `pending/pendingReleaseService.ts`'s
 * `releaseInfoFromDecision` (documented there in full): DecisionEngine's
 * `ReleaseInfo` is structurally narrower (optional fields Indexers' real
 * type declares as required-but-nullable, no `languages`/`indexerFlags`) --
 * this adapter fills those gaps with the same defaults Indexers' own
 * `createReleaseInfo()` uses.
 */
function releaseInfoFromDecisionEngine(release: RemoteBook["release"]): IndexersReleaseInfo {
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
    downloadProtocol: release.downloadProtocol,
    publishDate: release.publishDate,
    origin: release.origin ?? null,
    source: release.source ?? null,
    container: release.container ?? null,
    codec: release.codec ?? null,
    categories: release.categories ?? [],
    languages: [],
    indexerFlags: 0,
  };
}

/**
 * Adapts DecisionEngine's forward-ref `RemoteBook` to the real
 * `download-clients/RemoteBookLike.ts`'s `RemoteBookLike` --
 * `IDownloadClient.download`'s real parameter type. `seedConfiguration` has
 * no DecisionEngine equivalent (see decision-engine/remoteBook.ts's doc
 * comment: "SeedConfiguration ... is omitted -- no DecisionEngine
 * specification reads it") -- defaults to `null` the same way this class's
 * own call to `seedConfigProvider.getSeedConfiguration()` a few lines above
 * this adapter's call site has no consumer on DecisionEngine's `RemoteBook`
 * either (see this class's header doc comment on that call).
 */
function remoteBookToRemoteBookLike(remoteBook: RemoteBook): RemoteBookLike {
  return {
    release: releaseInfoFromDecisionEngine(remoteBook.release),
    seedConfiguration: null,
    releaseSource: remoteBook.releaseSource,
    author: { id: remoteBook.author.id },
    books: remoteBook.books,
  };
}

export interface IDownloadService {
  downloadReport(remoteBook: RemoteBook, downloadClientId: number | null): Promise<void>;
}

export interface IndexerFactoryLike {
  get(indexerId: number): IndexerLike | undefined;
}

export interface BookGrabbedEventAggregatorLike {
  publishEvent(event: BookGrabbedEvent): void;
}

export class DownloadService implements IDownloadService {
  constructor(
    private readonly downloadClientProvider: IProvideDownloadClient,
    private readonly downloadClientStatusService: IDownloadClientStatusService,
    private readonly indexerFactory: IndexerFactoryLike,
    private readonly indexerStatusService: {
      recordSuccess(indexerId: number): void;
      recordFailure(indexerId: number, minimumBackOffMs?: number): void;
    },
    private readonly rateLimitService: IRateLimitService,
    private readonly eventAggregator: BookGrabbedEventAggregatorLike,
    private readonly seedConfigProvider: IDownloadSeedConfigProvider
  ) {}

  async downloadReport(remoteBook: RemoteBook, downloadClientId: number | null): Promise<void> {
    const releaseWithReason = remoteBook.release as RemoteBook["release"] &
      ReleaseWithPendingReason;
    const filterBlockedClients =
      releaseWithReason.pendingReleaseReason ===
      PendingReleaseReason[PendingReleaseReason.DownloadClientUnavailable];

    const tags = remoteBook.author ? new Set(remoteBook.author.tags) : undefined;

    const downloadClient =
      downloadClientId !== null
        ? this.downloadClientProvider.get(downloadClientId)
        : this.downloadClientProvider.getDownloadClient(
            remoteBook.release.downloadProtocol,
            remoteBook.release.indexerId,
            filterBlockedClients,
            tags
          );

    await this.downloadReportInternal(remoteBook, downloadClient);
  }

  private async downloadReportInternal(
    remoteBook: RemoteBook,
    downloadClient: ReturnType<IProvideDownloadClient["get"]> | null
  ): Promise<void> {
    if (!remoteBook.author) {
      throw new Error("remoteBook.author must not be null");
    }
    if (remoteBook.books.length === 0) {
      throw new Error("remoteBook.books must have items");
    }

    if (downloadClient === null || downloadClient === undefined) {
      throw new DownloadClientUnavailableException(
        `${String(remoteBook.release.downloadProtocol)} Download client isn't configured yet`
      );
    }

    // See class doc comment: kept for call-order fidelity / seeding-lookup
    // side effects, result has no consumer on DecisionEngine's RemoteBook.
    this.seedConfigProvider.getSeedConfiguration(remoteBook.parsedBookInfo.releaseHash ?? "");

    // Limit grabs to 2 per second.
    const downloadUrl = remoteBook.release.downloadUrl;
    if (downloadUrl && downloadUrl.trim() !== "" && !downloadUrl.startsWith("magnet:")) {
      const url = new HttpUri(downloadUrl);
      await this.rateLimitService.waitAndPulse(url.host, 2000);
    }

    let indexer: IndexerLike | null = null;

    if (remoteBook.release.indexerId > 0) {
      indexer = this.indexerFactory.get(remoteBook.release.indexerId) ?? null;
    }

    let downloadId: string | null;
    try {
      downloadId = await downloadClient.download(remoteBookToRemoteBookLike(remoteBook), indexer);
      this.downloadClientStatusService.recordSuccess(downloadClient.definition.id);
      this.indexerStatusService.recordSuccess(remoteBook.release.indexerId);
    } catch (ex) {
      if (
        ex instanceof ReleaseUnavailableException ||
        ex instanceof ReleaseBlockedException ||
        ex instanceof DownloadClientRejectedReleaseException
      ) {
        throw ex;
      }

      if (ex instanceof ReleaseDownloadException) {
        if (ex.cause instanceof TooManyRequestsException && ex.cause.retryAfter !== null) {
          this.indexerStatusService.recordFailure(
            remoteBook.release.indexerId,
            ex.cause.retryAfter
          );
        } else {
          this.indexerStatusService.recordFailure(remoteBook.release.indexerId);
        }
        throw ex;
      }

      throw ex;
    }

    const bookGrabbedEvent = new BookGrabbedEvent(remoteBook);
    bookGrabbedEvent.downloadClient = downloadClient.name;
    bookGrabbedEvent.downloadClientId = downloadClient.definition.id;
    bookGrabbedEvent.downloadClientName = downloadClient.definition.name;

    if (downloadId && downloadId.trim() !== "") {
      bookGrabbedEvent.downloadId = downloadId;
    }

    this.eventAggregator.publishEvent(bookGrabbedEvent);
  }
}

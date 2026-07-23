/**
 * `download-clients` (real port of `NzbDrone.Core/Download/*Client*.cs` +
 * `NzbDrone.Core/Download/Clients/`) has landed for real at
 * `apps/server/src/download-clients/`. Every type this module used to
 * forward-ref here (`DownloadItemStatus`, `DownloadClientItem`,
 * `DownloadClientDefinition`, `DownloadClientInfo`,
 * `TorrentSeedConfiguration`, `IDownloadClient`, `IProvideDownloadClient`,
 * `IDownloadClientFactory`, `IDownloadClientStatusService`,
 * `DownloadClientException` + subclasses) is now re-exported from the real
 * module below instead of redeclared, per this file's original header
 * comment ("when download-clients lands, these should be deleted in favor
 * of importing the real types").
 *
 * Real-vs-forward-ref shape differences resolved during the swap (call
 * sites throughout this module were updated to match):
 *  - `DownloadClientItem.downloadClientInfo` is `DownloadClientItemClientInfo
 *    | null` in the real type (this module's forward-ref had it as
 *    non-null) -- matches the real C# `DownloadClientItemClientInfo
 *    DownloadClientInfo { get; set; }` (a plain nullable reference-type
 *    property, no non-null guarantee in the C# source either); the real
 *    port's own `createDownloadClientItem()` defaults it to `null`. Call
 *    sites that read `.downloadClientInfo.xxx` now null-check, matching how
 *    the real C# call sites (`ProvideImportItemService.ProvideImportItem`,
 *    `DownloadHistoryService.Handle(...)`) are only ever invoked once a
 *    `TrackedDownload` has a live, freshly-tracked `DownloadClientItem` in
 *    practice -- the null case is a defensive TS-idiom addition, not a
 *    reachable runtime path change.
 *  - `DownloadClientItem.remainingTimeMs`/`outputPath: string` are the real
 *    `remainingTime`/`outputPath: OsPath` (a real ported `OsPath` class, not
 *    a plain path string) -- `isOutputPathEmpty` below now delegates to the
 *    real `OsPath.isEmpty` getter instead of a string equality check.
 *  - `DownloadClientDefinition.tags` is `number[]` in the real type (this
 *    module's forward-ref had `Set<number>`); real also carries the full
 *    `ModelBase`/`ProviderDefinition` field set (`implementation`,
 *    `configContract`, `settings`, `enable`) this module's narrower
 *    forward-ref omitted.
 *  - `IDownloadClient`'s methods (`getItems`/`getImportItem`/`removeItem`/
 *    `getStatus`/`markItemAsImported`) are `Promise<T> | T` in the real type
 *    (this module's forward-ref had them synchronous-only, and
 *    `download()` returned `Promise<string>` not `Promise<string | null>`)
 *    -- the real port's QBittorrent client needs a network round trip for
 *    some of these (see IDownloadClient.ts's doc comment). Call sites that
 *    invoked these synchronously (`DownloadMonitoringService.processClientDownloads`)
 *    now `await` them.
 *  - `IDownloadClient.download`'s `remoteBook`/`indexer` parameters are the
 *    real `RemoteBookLike`/`IIndexer` types (this module's forward-ref had
 *    a local narrow `IndexerLike` and DecisionEngine's `RemoteBook`) --
 *    `downloadService.ts` now adapts DecisionEngine's `RemoteBook` to
 *    `RemoteBookLike` at the one call site that crosses this boundary,
 *    matching the existing `pendingReleaseService.ts`/`downloadHistoryService.ts`
 *    precedent for bridging DecisionEngine's forward-ref `RemoteBook` to a
 *    real sibling module's type (see those files' `releaseInfoFromDecision`/
 *    `parsedBookInfoFromDecision` doc comments) -- this module's own
 *    `IndexerFactoryLike`/`IndexerLike` are updated to the real
 *    `indexers/IIndexer.ts` `IIndexer` type since that module has also
 *    landed for real.
 *  - `IProvideDownloadClient.getDownloadClient`'s `tags` parameter is
 *    `Set<number>` (no `| null`) in the real type -- `downloadService.ts`'s
 *    call site now passes `undefined` instead of `null` for "no tags".
 */

export {
  DownloadItemStatus,
  type DownloadClientItemClientInfo,
  type DownloadClientItem,
  createDownloadClientItem,
  cloneDownloadClientItem,
  type DownloadClientDefinition,
  createDownloadClientDefinition,
  type DownloadClientInfo,
  createDownloadClientInfo,
  type TorrentSeedConfiguration,
  DEFAULT_TORRENT_SEED_CONFIGURATION,
  type IDownloadClient,
  type IProvideDownloadClient,
  type IDownloadClientFactory,
  type IDownloadClientStatusService,
  DownloadClientException,
  DownloadClientAuthenticationException,
  DownloadClientUnavailableException,
} from "../download-clients/index.js";

/**
 * `IIndexer` (NzbDrone.Core/Indexers/IIndexer.cs) is owned by the `indexers`
 * module, not `download-clients` -- but `IDownloadClient.download`'s real
 * signature (download-clients/IDownloadClient.ts) takes `indexer: IIndexer |
 * null`, so this module's own indexer-lookup surface (`IndexerFactoryLike`
 * in downloadService.ts) is typed against it directly. Re-exported here
 * under the old `IndexerLike` name this module's call sites already use, so
 * the swap stays mechanical at those call sites.
 */
export { type IIndexer as IndexerLike } from "../indexers/IIndexer.js";

import type { DownloadClientItem } from "../download-clients/DownloadClientItem.js";

/** Ported from `OsPath.IsEmpty` as applied to `DownloadClientItem.OutputPath` throughout this module's real C# source (e.g. CompletedDownloadService.ValidatePath). Delegates to the real `OsPath.isEmpty` getter (download-clients/OsPath.ts) now that `outputPath` is a real `OsPath` instance, not a plain string. */
export function isOutputPathEmpty(item: DownloadClientItem): boolean {
  return item.outputPath.isEmpty;
}

// ---- NzbDrone.Core/Exceptions/*.cs (no real equivalent yet) ----

/** Forward-ref for the slice of NzbDrone.Core/Exceptions/*.cs `DownloadService`/`ProcessDownloadDecisions` catch by type. `Exceptions` (the generic exception-hierarchy module) isn't ported anywhere yet -- no real equivalent to swap to. */
export class ReleaseUnavailableException extends Error {}
export class ReleaseBlockedException extends Error {}
export class DownloadClientRejectedReleaseException extends Error {}
export class ReleaseDownloadException extends Error {
  constructor(
    message: string,
    readonly innerException?: Error
  ) {
    super(message);
  }
}

/** Forward-ref for NzbDrone.Common/Http/TooManyRequestsException.cs's slice `DownloadService.DownloadReport`'s catch block reads (`RetryAfter`). `NzbDrone.Common.Http` isn't ported anywhere yet -- no real equivalent to swap to. */
export class TooManyRequestsException extends Error {
  constructor(
    message: string,
    readonly retryAfterMs: number
  ) {
    super(message);
  }
}

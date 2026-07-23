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

// ---- NzbDrone.Core/Exceptions/*.cs ----

/**
 * RECONCILED at Phase 4 Wave 1 merge review: this used to be a third,
 * independent forward-ref copy of these exceptions (a `apps/server/src/
 * exceptions/` module now exists with the real, faithful port -- see that
 * module's own doc comments for its exact shapes). This file does NOT
 * import from there, though -- and that's deliberate, not an oversight.
 *
 * The real C# `NzbDrone.Core.Exceptions.ReleaseDownloadException` etc. are
 * actually THROWN by `NzbDrone.Core.Download.TorrentClientBase`/
 * `UsenetClientBase`/`Sabnzbd` -- and in this port, `download-clients/
 * TorrentClientBase.ts` and `download-clients/sabnzbd/Sabnzbd.ts` each
 * independently declared their OWN local copies of these same exceptions
 * (same situation this file was in), since `download-clients` was also
 * ported in a worktree parallel to `Exceptions`. Those local copies are
 * what this port's download clients actually construct and throw at
 * runtime today.
 *
 * `instanceof` checks only match the exact class (or a subclass of it) an
 * object was constructed from -- two textually-identical `class X extends
 * Error {}` declarations in different files are NOT instanceof-compatible
 * with each other. So importing from `exceptions/` here instead of
 * `download-clients/` would silently break every catch block below: they'd
 * compile fine, but `ex instanceof ReleaseUnavailableException` would
 * always be `false` for an exception actually thrown by
 * `TorrentClientBase.download()`, since it throws `download-clients`' own
 * class, not `exceptions`'. Importing from `download-clients/` instead
 * (the actual, live throw site) is the correct fix -- verified against the
 * chain above, not assumed.
 *
 * Adopting the real `exceptions/` module's classes throughout the download
 * pipeline (`download-clients` AND this file together) is a real, deferred
 * follow-up: `exceptions/ReleaseDownloadException`'s constructor requires
 * a `release: ReleaseInfo` from `parser/model/releaseInfo.js`, but
 * `download-clients` only has access to `indexers/releaseInfo.js`'s
 * `ReleaseInfo` (via `RemoteBookLike`) -- two independently-ported,
 * structurally different `ReleaseInfo` types (different field nullability,
 * `downloadProtocol: number` vs `string | null`). Unifying those two
 * `ReleaseInfo` types is a prerequisite for that adoption and is out of
 * scope for a routine merge-review reconciliation; flagged here for a
 * dedicated follow-up rather than rushed.
 */
export {
  ReleaseDownloadException,
  ReleaseUnavailableException,
  ReleaseBlockedException,
} from "../download-clients/TorrentClientBase.js";
export { DownloadClientRejectedReleaseException } from "../download-clients/sabnzbd/Sabnzbd.js";

/**
 * The real `TooManyRequestsException` (Phase 0, `apps/server/src/http/
 * HttpException.ts`) -- thrown by `HttpClient.ts` on a 429 response. This
 * file's old forward-ref guessed a `(message, retryAfterMs)` constructor
 * shape; the real one is `(request, response)` with a `retryAfter: number
 * | null` property (not `retryAfterMs`, and nullable). Call sites in this
 * module reading `.retryAfterMs` need to read `.retryAfter` (and
 * null-check) instead -- see downloadService.ts.
 */
export { TooManyRequestsException } from "../http/HttpException.js";

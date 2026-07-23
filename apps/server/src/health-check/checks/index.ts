/**
 * Barrel export for the 26 concrete HealthCheck checks -- see
 * health-check/index.ts.
 *
 * Every check module exports its own `CHECK_ON` constant (and several share
 * generic forward-ref interface names like `OsInfoLike`) -- flat `export *`
 * re-exporting would collide across 26 modules doing the exact same thing,
 * so each check is exported under its own namespace instead (the same
 * `export * as X from` shape `indexers/index.ts`'s `Torznab`/`Newznab` and
 * `download-clients/index.ts`'s `QBittorrent`/`Sabnzbd`/`Blackhole`
 * namespaces already use for the same "many sibling modules with
 * overlapping names" situation). The check CLASS itself (e.g.
 * `ApiKeyValidationCheck`) is reachable as `Checks.ApiKeyValidationCheck.ApiKeyValidationCheck`.
 */

export * as ApiKeyValidationCheck from "./apiKeyValidationCheck.js";
export * as AppDataLocationCheck from "./appDataLocationCheck.js";
export * as BookImportedEvent from "./bookImportedEvent.js";
export * as CalibreRootFolderCheck from "./calibreRootFolderCheck.js";
export * as DownloadClientCheck from "./downloadClientCheck.js";
export * as DownloadClientRemovesCompletedDownloadsCheck from "./downloadClientRemovesCompletedDownloadsCheck.js";
export * as DownloadClientRootFolderCheck from "./downloadClientRootFolderCheck.js";
export * as DownloadClientStatusCheck from "./downloadClientStatusCheck.js";
export * as ImportListRootFolderCheck from "./importListRootFolderCheck.js";
export * as ImportListStatusCheck from "./importListStatusCheck.js";
export * as ImportMechanismCheck from "./importMechanismCheck.js";
export * as IndexerDownloadClientCheck from "./indexerDownloadClientCheck.js";
export * as IndexerJackettAllCheck from "./indexerJackettAllCheck.js";
export * as IndexerLongTermStatusCheck from "./indexerLongTermStatusCheck.js";
export * as IndexerRssCheck from "./indexerRssCheck.js";
export * as IndexerSearchCheck from "./indexerSearchCheck.js";
export * as IndexerStatusCheck from "./indexerStatusCheck.js";
export * as MountCheck from "./mountCheck.js";
export * as NotificationStatusCheck from "./notificationStatusCheck.js";
export * as PackageGlobalMessageCheck from "./packageGlobalMessageCheck.js";
export * as ProxyCheck from "./proxyCheck.js";
export * as RecyclingBinCheck from "./recyclingBinCheck.js";
export * as ReleaseBranchCheck from "./releaseBranchCheck.js";
export * as RemotePathMappingCheck from "./remotePathMappingCheck.js";
export * as RootFolderCheck from "./rootFolderCheck.js";
export * as SystemTimeCheck from "./systemTimeCheck.js";
export * as UpdateCheck from "./updateCheck.js";

// Shared, collision-free helper module -- flat re-export is fine here.
export * from "./_shared.js";

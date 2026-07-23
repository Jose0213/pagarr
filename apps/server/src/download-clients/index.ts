/**
 * Barrel export for the Download Clients module -- port of the shared
 * `NzbDrone.Core/Download/*.cs` base infrastructure plus the qBittorrent,
 * SABnzbd, and Blackhole client implementations from
 * `NzbDrone.Core/Download/Clients/`.
 *
 * OUT OF SCOPE (not ported): Aria2, Deluge, DownloadStation, Flood,
 * Hadouken, NzbVortex, Nzbget, Pneumatic, Transmission, Vuze, rTorrent,
 * uTorrent. qBittorrent and SABnzbd are the two clients run in production;
 * Blackhole (a watch-folder client with no API) is the manual-import
 * fallback path. See this module's task brief / commit history for the
 * full rationale.
 */

export * from "./BlocklistServiceLike.js";
export * from "./DownloadClientBase.js";
export * from "./DownloadClientDefinition.js";
export * from "./DownloadClientException.js";
export * from "./DownloadClientFactory.js";
export * from "./DownloadClientInfo.js";
export * from "./DownloadClientItem.js";
export * from "./DownloadClientProvider.js";
export * from "./DownloadClientRepository.js";
export * from "./DownloadClientStatus.js";
export * from "./DownloadClientStatusRepository.js";
export * from "./DownloadClientStatusService.js";
export * from "./DownloadClientType.js";
export * from "./DownloadItemStatus.js";
export * from "./IDiskProviderLike.js";
export * from "./IDownloadClient.js";
export * from "./OsPath.js";
export * from "./RemoteBookLike.js";
export * from "./RemotePathMappingService.js";
export * from "./TorrentClientBase.js";
export * from "./TorrentSeedConfiguration.js";
export * from "./UsenetClientBase.js";
export * from "./fileNameCleaner.js";
export * from "./magnetLink.js";

export * as QBittorrent from "./qbittorrent/index.js";
export * as Sabnzbd from "./sabnzbd/index.js";
export * as Blackhole from "./blackhole/index.js";

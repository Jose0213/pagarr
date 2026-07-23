import type { IConfigService } from "../../config/configService.js";
import type { ValidationFailure } from "../../indexers/IIndexerSettings.js";
import { OsPath } from "../OsPath.js";
import {
  DownloadClientAuthenticationException,
  DownloadClientException,
} from "../DownloadClientException.js";
import { DownloadItemStatus } from "../DownloadItemStatus.js";
import { MagnetNotSupportedError, TorrentClientBase } from "../TorrentClientBase.js";
import { isRecentBook } from "../RemoteBookLike.js";
import { createDownloadClientInfo, type DownloadClientInfo } from "../DownloadClientInfo.js";
import {
  createDownloadClientItem,
  downloadClientItemClientInfoFromDownloadClient,
  type DownloadClientItem,
} from "../DownloadClientItem.js";
import type { IDiskProviderLike } from "../IDiskProviderLike.js";
import type { IRemotePathMappingService } from "../RemotePathMappingService.js";
import type { RemoteBookLike } from "../RemoteBookLike.js";
import type { BlocklistServiceLike } from "../BlocklistServiceLike.js";
import type { DownloadClientLogger } from "../DownloadClientBase.js";
import { noopDownloadClientLogger } from "../DownloadClientBase.js";
import {
  type QBittorrentPreferences,
  QBittorrentMaxRatioAction,
} from "./QBittorrentPreferences.js";
import { QBittorrentPriority } from "./QBittorrentPriority.js";
import type { IQBittorrentProxy, IQBittorrentProxySelector } from "./QBittorrentProxySelector.js";
import { versionGte, versionLt } from "./QBittorrentProxySelector.js";
import type { QBittorrentSettings } from "./QBittorrentSettings.js";
import { QBittorrentState } from "./QBittorrentState.js";
import type { QBittorrentTorrent } from "./QBittorrentTorrent.js";
import type { IHttpClient } from "../../http/HttpClient.js";

interface SeedingTimeCacheEntry {
  lastFetchedMs: number;
  seedingTimeSeconds: number;
}

/**
 * Ported from NzbDrone.Core/Download/Clients/QBittorrent/QBittorrent.cs.
 *
 * DEVIATION -- seeding-time cache: C#'s `ICacheManager.GetCache<SeedingTimeCacheEntry>()`
 * (no explicit TTL passed to `GetCache`, i.e. indefinite retention -- only
 * the per-`Set()` call's `TimeSpan.FromMinutes(5)` matters, refreshed on
 * every read) is ported as a plain instance `Map` with the same 5-minute
 * refresh-on-read behavior hand-rolled via a stored expiry, same rationale
 * as the auth-cookie caches in QBittorrentProxyV1/V2.ts.
 */
export class QBittorrent extends TorrentClientBase<QBittorrentSettings> {
  readonly name = "qBittorrent";

  private readonly proxySelector: IQBittorrentProxySelector;
  private readonly seedingTimeCache = new Map<
    string,
    { entry: SeedingTimeCacheEntry; expiresAtMs: number }
  >();
  private readonly now: () => number;

  constructor(
    proxySelector: IQBittorrentProxySelector,
    httpClient: IHttpClient,
    configService: IConfigService,
    diskProvider: IDiskProviderLike,
    remotePathMappingService: IRemotePathMappingService,
    blocklistService?: BlocklistServiceLike,
    logger: DownloadClientLogger = noopDownloadClientLogger,
    now: () => number = () => Date.now()
  ) {
    super(
      httpClient,
      configService,
      diskProvider,
      remotePathMappingService,
      blocklistService,
      logger
    );
    this.proxySelector = proxySelector;
    this.now = now;
  }

  private async proxy(): Promise<IQBittorrentProxy> {
    return this.proxySelector.getProxy(this.settings);
  }

  private async proxyApiVersion(): Promise<string> {
    return this.proxySelector.getApiVersion(this.settings);
  }

  /** Ported from QBittorrent.MarkItemAsImported: sets the post-import category. */
  override async markItemAsImported(downloadClientItem: DownloadClientItem): Promise<void> {
    if (
      this.settings.musicImportedCategory &&
      this.settings.musicImportedCategory.trim() !== "" &&
      this.settings.musicImportedCategory !== this.settings.musicCategory
    ) {
      try {
        const proxy = await this.proxy();
        await proxy.setTorrentLabel(
          downloadClientItem.downloadId.toLowerCase(),
          this.settings.musicImportedCategory,
          this.settings
        );
      } catch (ex) {
        if (ex instanceof DownloadClientException) {
          this.logger.warn(
            'Failed to set post-import torrent label "%s" for %s in qBittorrent. Does the label exist?',
            this.settings.musicImportedCategory,
            downloadClientItem.title
          );
          return;
        }
        throw ex;
      }
    }
  }

  protected async addFromMagnetLink(
    remoteBook: RemoteBookLike,
    hash: string,
    magnetLink: string
  ): Promise<string | null> {
    const proxy = await this.proxy();

    const config = await proxy.getConfig(this.settings);
    if (!config.dht && !magnetLink.includes("&tr=")) {
      throw new MagnetNotSupportedError(
        "Magnet Links without trackers not supported if DHT is disabled"
      );
    }

    const setShareLimits =
      remoteBook.seedConfiguration != null &&
      (remoteBook.seedConfiguration.ratio != null || remoteBook.seedConfiguration.seedTime != null);
    const apiVersion = await this.proxyApiVersion();
    const addHasSetShareLimits = setShareLimits && versionGte(apiVersion, "2.8.1");
    const recentBook = isRecentBook(remoteBook);
    const moveToTop =
      (recentBook && this.settings.recentTvPriority === QBittorrentPriority.First) ||
      (!recentBook && this.settings.olderTvPriority === QBittorrentPriority.First);
    const forceStart = this.settings.initialState === QBittorrentState.ForceStart;

    await proxy.addTorrentFromUrl(
      magnetLink,
      addHasSetShareLimits && setShareLimits ? remoteBook.seedConfiguration : null,
      this.settings
    );

    if ((!addHasSetShareLimits && setShareLimits) || moveToTop || forceStart) {
      if (!(await this.waitForTorrent(hash))) {
        return hash;
      }

      if (!addHasSetShareLimits && setShareLimits) {
        try {
          await proxy.setTorrentSeedingConfiguration(
            hash.toLowerCase(),
            remoteBook.seedConfiguration!,
            this.settings
          );
        } catch (ex) {
          this.logger.warn("Failed to set the torrent seed criteria for %s.", hash, ex);
        }
      }

      if (moveToTop) {
        try {
          await proxy.moveTorrentToTopInQueue(hash.toLowerCase(), this.settings);
        } catch (ex) {
          this.logger.warn("Failed to set the torrent priority for %s.", hash, ex);
        }
      }

      if (forceStart) {
        try {
          await proxy.setForceStart(hash.toLowerCase(), true, this.settings);
        } catch (ex) {
          this.logger.warn("Failed to set ForceStart for %s.", hash, ex);
        }
      }
    }

    return hash;
  }

  protected async addFromTorrentFile(
    remoteBook: RemoteBookLike,
    hash: string,
    filename: string,
    fileContent: Uint8Array
  ): Promise<string | null> {
    const proxy = await this.proxy();

    const setShareLimits =
      remoteBook.seedConfiguration != null &&
      (remoteBook.seedConfiguration.ratio != null || remoteBook.seedConfiguration.seedTime != null);
    const apiVersion = await this.proxyApiVersion();
    const addHasSetShareLimits = setShareLimits && versionGte(apiVersion, "2.8.1");
    const recentBook = isRecentBook(remoteBook);
    const moveToTop =
      (recentBook && this.settings.recentTvPriority === QBittorrentPriority.First) ||
      (!recentBook && this.settings.olderTvPriority === QBittorrentPriority.First);
    const forceStart = this.settings.initialState === QBittorrentState.ForceStart;

    await proxy.addTorrentFromFile(
      filename,
      fileContent,
      addHasSetShareLimits ? remoteBook.seedConfiguration : null,
      this.settings
    );

    if ((!addHasSetShareLimits && setShareLimits) || moveToTop || forceStart) {
      if (!(await this.waitForTorrent(hash))) {
        return hash;
      }

      if (!addHasSetShareLimits && setShareLimits) {
        try {
          await proxy.setTorrentSeedingConfiguration(
            hash.toLowerCase(),
            remoteBook.seedConfiguration!,
            this.settings
          );
        } catch (ex) {
          this.logger.warn("Failed to set the torrent seed criteria for %s.", hash, ex);
        }
      }

      if (moveToTop) {
        try {
          await proxy.moveTorrentToTopInQueue(hash.toLowerCase(), this.settings);
        } catch (ex) {
          this.logger.warn("Failed to set the torrent priority for %s.", hash, ex);
        }
      }

      if (forceStart) {
        try {
          await proxy.setForceStart(hash.toLowerCase(), true, this.settings);
        } catch (ex) {
          this.logger.warn("Failed to set ForceStart for %s.", hash, ex);
        }
      }
    }

    return hash;
  }

  protected async waitForTorrent(hash: string): Promise<boolean> {
    const proxy = await this.proxy();
    let count = 10;

    while (count !== 0) {
      try {
        if (await proxy.isTorrentLoaded(hash.toLowerCase(), this.settings)) {
          return true;
        }
      } catch {
        // ignore, retry
      }

      this.logger.trace("Torrent '%s' not yet visible in qbit, waiting 100ms.", hash);
      await sleep(100);
      count--;
    }

    this.logger.warn(
      "Failed to load torrent '%s' within 500 ms, skipping additional parameters.",
      hash
    );
    return false;
  }

  async getItems(): Promise<DownloadClientItem[]> {
    const proxy = await this.proxy();
    const version = await this.proxyApiVersion();
    const config = await proxy.getConfig(this.settings);
    const torrents = await proxy.getTorrents(this.settings);

    const queueItems: DownloadClientItem[] = [];

    for (const torrent of torrents) {
      const item = createDownloadClientItem({
        downloadId: torrent.hash.toUpperCase(),
        category:
          torrent.category && torrent.category.trim() !== "" ? torrent.category : torrent.label,
        title: torrent.name,
        totalSize: torrent.size,
        downloadClientInfo: downloadClientItemClientInfoFromDownloadClient(
          this,
          Boolean(
            this.settings.musicImportedCategory && this.settings.musicImportedCategory.trim() !== ""
          )
        ),
        remainingSize: Math.round(torrent.size * (1.0 - torrent.progress)),
        remainingTime: this.getRemainingTime(torrent),
        seedRatio: torrent.ratio,
      });

      // Avoid removing torrents that haven't reached the global max ratio.
      // Removal also requires the torrent to be paused, in case a higher
      // max ratio was set on the torrent itself (which is not exposed by
      // the api).
      item.canMoveFiles = item.canBeRemoved =
        (torrent.state === "pausedUP" || torrent.state === "stoppedUP") &&
        (await this.hasReachedSeedLimit(torrent, config));

      switch (torrent.state) {
        case "error": // some error occurred, applies to paused torrents, warning so failed download handling isn't triggered
          item.status = DownloadItemStatus.Warning;
          item.message = "qBittorrent is reporting an error";
          break;

        case "stoppedDL": // torrent is stopped and has NOT finished downloading
        case "pausedDL": // torrent is paused and has NOT finished downloading (qBittorrent < 5)
          item.status = DownloadItemStatus.Paused;
          break;

        case "queuedDL": // queuing is enabled and torrent is queued for download
        case "checkingDL": // same as checkingUP, but torrent has NOT finished downloading
        case "checkingUP": // torrent has finished downloading and is being checked
        case "checkingResumeData": // torrent is checking resume data on load
          item.status = DownloadItemStatus.Queued;
          break;

        case "pausedUP": // torrent is paused and has finished downloading (qBittorent < 5)
        case "stoppedUP": // torrent is stopped and has finished downloading
        case "uploading": // torrent is being seeded and data is being transferred
        case "stalledUP": // torrent is being seeded, but no connection were made
        case "queuedUP": // queuing is enabled and torrent is queued for upload
        case "forcedUP": // torrent has finished downloading and is being forcibly seeded
          item.status = DownloadItemStatus.Completed;
          item.remainingTime = 0; // qBittorrent sends eta=8640000 for completed torrents
          break;

        case "stalledDL": // torrent is being downloaded, but no connection were made
          item.status = DownloadItemStatus.Warning;
          item.message = "The download is stalled with no connections";
          break;

        case "missingFiles": // torrent is being downloaded, but no connection were made
          item.status = DownloadItemStatus.Warning;
          item.message = "The download is missing files";
          break;

        case "metaDL": // torrent magnet is being downloaded
        case "forcedMetaDL": // torrent metadata is being forcibly downloaded
          if (config.dht) {
            item.status = DownloadItemStatus.Queued;
            item.message = "qBittorrent is downloading metadata";
          } else {
            item.status = DownloadItemStatus.Warning;
            item.message = "qBittorrent cannot resolve magnet link with DHT disabled";
          }
          break;

        case "forcedDL": // torrent is being downloaded, and was forced started
        case "moving": // torrent is being moved from a folder
        case "downloading": // torrent is being downloaded and data is being transferred
          item.status = DownloadItemStatus.Downloading;
          break;

        default: // new status in API? default to downloading
          item.message = "Unknown download state: " + torrent.state;
          this.logger.info(item.message);
          item.status = DownloadItemStatus.Downloading;
          break;
      }

      if (versionGte(version, "2.6.1") && item.status === DownloadItemStatus.Completed) {
        if (torrent.content_path !== torrent.save_path) {
          item.outputPath = this.remotePathMappingService.remapRemoteToLocal(
            this.settings.host,
            new OsPath(torrent.content_path)
          );
        } else {
          item.status = DownloadItemStatus.Warning;
          item.message =
            "Unable to Import. Path matches client base download directory, it's possible 'Keep top-level folder' is disabled for this torrent or 'Torrent Content Layout' is NOT set to 'Original' or 'Create Subfolder'?";
        }
      }

      queueItems.push(item);
    }

    return queueItems;
  }

  async removeItem(item: DownloadClientItem, deleteData: boolean): Promise<void> {
    const proxy = await this.proxy();
    await proxy.removeTorrent(item.downloadId.toLowerCase(), deleteData, this.settings);
  }

  override async getImportItem(
    item: DownloadClientItem,
    _previousImportAttempt: DownloadClientItem | null
  ): Promise<DownloadClientItem> {
    // On API version >= 2.6.1 this is already set correctly.
    if (!item.outputPath.isEmpty) {
      return item;
    }

    const proxy = await this.proxy();
    const files = await proxy.getTorrentFiles(item.downloadId.toLowerCase(), this.settings);
    if (files.length === 0) {
      this.logger.debug(`No files found for torrent ${item.title} in qBittorrent`);
      return item;
    }

    const properties = await proxy.getTorrentProperties(
      item.downloadId.toLowerCase(),
      this.settings
    );
    const savePath = new OsPath(properties.save_path);

    const result = { ...item };

    // get the first subdirectory -- QBittorrent returns `/` path separators
    // even on windows...
    let relativePath = new OsPath(files[0]!.name);
    while (!relativePath.directory.isEmpty) {
      relativePath = relativePath.directory;
    }

    const outputPath = savePath.combineString(relativePath.fileName ?? "");

    result.outputPath = this.remotePathMappingService.remapRemoteToLocal(
      this.settings.host,
      outputPath
    );

    return result;
  }

  async getStatus(): Promise<DownloadClientInfo> {
    const proxy = await this.proxy();
    const version = await this.proxyApiVersion();
    const config = await proxy.getConfig(this.settings);

    let destDir = new OsPath(config.save_path);

    if (
      this.settings.musicCategory &&
      this.settings.musicCategory.trim() !== "" &&
      versionGte(version, "2.0")
    ) {
      const labels = await proxy.getLabels(this.settings);
      const label = labels[this.settings.musicCategory];
      if (label && label.savePath && label.savePath.trim() !== "") {
        let savePath = label.savePath;

        if (savePath.startsWith("//")) {
          this.logger.trace(
            "Replacing double forward slashes in path '%s'. If this is not meant to be a Windows UNC path fix the 'Save Path' in qBittorrent's %s category",
            savePath,
            this.settings.musicCategory
          );
          savePath = savePath.replaceAll("/", "\\");
        }

        const labelDir = new OsPath(savePath);

        if (labelDir.isRooted) {
          destDir = labelDir;
        } else {
          destDir = destDir.combine(labelDir);
        }
      }
    }

    return createDownloadClientInfo({
      isLocalhost: this.settings.host === "127.0.0.1" || this.settings.host === "localhost",
      outputRootFolders: [
        this.remotePathMappingService.remapRemoteToLocal(this.settings.host, destDir),
      ],
      removesCompletedDownloads: this.removesCompletedDownloads(config),
    });
  }

  private removesCompletedDownloads(config: QBittorrentPreferences): boolean {
    const minimumRetention = 60 * 24 * 14; // 14 days in minutes
    return (
      (config.max_ratio_enabled ||
        (config.max_seeding_time_enabled && config.max_seeding_time < minimumRetention)) &&
      (config.max_ratio_act === QBittorrentMaxRatioAction.Remove ||
        config.max_ratio_act === QBittorrentMaxRatioAction.DeleteFiles)
    );
  }

  protected async testConnection(failures: ValidationFailure[]): Promise<void> {
    const connectionFailure = await this.testConnectionImpl();
    if (connectionFailure) {
      failures.push(connectionFailure);
    }
    if (failures.some((f) => !f.isWarning)) {
      return;
    }

    const categoryFailure = await this.testCategory();
    if (categoryFailure) {
      failures.push(categoryFailure);
    }

    const priorityFailure = await this.testPrioritySupport();
    if (priorityFailure) {
      failures.push(priorityFailure);
    }

    const torrentsFailure = await this.testGetTorrents();
    if (torrentsFailure) {
      failures.push(torrentsFailure);
    }
  }

  private async testConnectionImpl(): Promise<ValidationFailure | null> {
    try {
      const version = await this.proxySelector.getApiVersion(this.settings, true);
      if (versionLt(version, "1.5")) {
        // API version 5 introduced the "save_path" property in /query/torrents
        return {
          propertyName: "Host",
          errorMessage: "Unsupported client version",
          detailedDescription: "Please upgrade to qBittorrent version 3.2.4 or higher.",
        };
      } else if (versionLt(version, "1.6")) {
        // API version 6 introduced support for labels
        if (this.settings.musicCategory && this.settings.musicCategory.trim() !== "") {
          return {
            propertyName: "Category",
            errorMessage: "Category is not supported",
            detailedDescription:
              "Labels are not supported until qBittorrent version 3.3.0. Please upgrade or try again with an empty Category.",
          };
        }
      } else if (!this.settings.musicCategory || this.settings.musicCategory.trim() === "") {
        // warn if labels are supported, but category is not provided
        return {
          propertyName: "MusicCategory",
          errorMessage: "Category is recommended",
          isWarning: true,
          detailedDescription:
            "Pagarr will not attempt to import completed downloads without a category.",
        };
      }

      // Complain if qBittorrent is configured to remove torrents on max ratio.
      const proxy = await this.proxy();
      const config = await proxy.getConfig(this.settings);
      if (this.removesCompletedDownloads(config)) {
        return {
          propertyName: "",
          errorMessage:
            "qBittorrent is configured to remove torrents when they reach their Share Ratio Limit",
          detailedDescription:
            "Pagarr will be unable to perform Completed Download Handling as configured. You can fix this in qBittorrent ('Tools -> Options...' in the menu) by changing 'Options -> BitTorrent -> Share Ratio Limiting' from 'Remove them' to 'Pause them'.",
        };
      }
    } catch (ex) {
      if (ex instanceof DownloadClientAuthenticationException) {
        this.logger.error("Unable to authenticate", ex);
        return {
          propertyName: "Username",
          errorMessage: "Authentication failure",
          detailedDescription: "Please verify your username and password.",
        };
      }

      this.logger.error("Unable to test qBittorrent", ex);
      return {
        propertyName: "Host",
        errorMessage: "Unable to connect to qBittorrent",
        detailedDescription: errorMessage(ex),
      };
    }

    return null;
  }

  private async testCategory(): Promise<ValidationFailure | null> {
    if (
      (!this.settings.musicCategory || this.settings.musicCategory.trim() === "") &&
      (!this.settings.musicImportedCategory || this.settings.musicImportedCategory.trim() === "")
    ) {
      return null;
    }

    // api v1 doesn't need to check/add categories as it's done on set
    const version = await this.proxySelector.getApiVersion(this.settings, true);
    if (versionLt(version, "2.0")) {
      return null;
    }

    const proxy = await this.proxy();
    let labels = await proxy.getLabels(this.settings);

    if (
      this.settings.musicCategory &&
      this.settings.musicCategory.trim() !== "" &&
      !(this.settings.musicCategory in labels)
    ) {
      await proxy.addLabel(this.settings.musicCategory, this.settings);
      labels = await proxy.getLabels(this.settings);

      if (!(this.settings.musicCategory in labels)) {
        return {
          propertyName: "MusicCategory",
          errorMessage: "Configuration of label failed",
          detailedDescription: "Pagarr was unable to add the label to qBittorrent.",
        };
      }
    }

    if (
      this.settings.musicImportedCategory &&
      this.settings.musicImportedCategory.trim() !== "" &&
      !(this.settings.musicImportedCategory in labels)
    ) {
      await proxy.addLabel(this.settings.musicImportedCategory, this.settings);
      labels = await proxy.getLabels(this.settings);

      if (!(this.settings.musicImportedCategory in labels)) {
        return {
          propertyName: "MusicImportedCategory",
          errorMessage: "Configuration of label failed",
          detailedDescription: "Pagarr was unable to add the label to qBittorrent.",
        };
      }
    }

    return null;
  }

  private async testPrioritySupport(): Promise<ValidationFailure | null> {
    const recentPriorityDefault = this.settings.recentTvPriority === QBittorrentPriority.Last;
    const olderPriorityDefault = this.settings.olderTvPriority === QBittorrentPriority.Last;

    if (olderPriorityDefault && recentPriorityDefault) {
      return null;
    }

    try {
      const proxy = await this.proxy();
      const config = await proxy.getConfig(this.settings);

      if (!config.queueing_enabled) {
        if (!recentPriorityDefault) {
          return {
            propertyName: "recentTvPriority",
            errorMessage: "Queueing not enabled",
            detailedDescription:
              "Torrent Queueing is not enabled in your qBittorrent settings. Enable it in qBittorrent or select 'Last' as priority.",
          };
        } else if (!olderPriorityDefault) {
          return {
            propertyName: "olderTvPriority",
            errorMessage: "Queueing not enabled",
            detailedDescription:
              "Torrent Queueing is not enabled in your qBittorrent settings. Enable it in qBittorrent or select 'Last' as priority.",
          };
        }
      }
    } catch (ex) {
      this.logger.error("Failed to test qBittorrent", ex);
      return { propertyName: "", errorMessage: "Unknown exception: " + errorMessage(ex) };
    }

    return null;
  }

  private async testGetTorrents(): Promise<ValidationFailure | null> {
    try {
      const proxy = await this.proxy();
      await proxy.getTorrents(this.settings);
    } catch (ex) {
      this.logger.error("Failed to get torrents", ex);
      return {
        propertyName: "",
        errorMessage: "Failed to get the list of torrents: " + errorMessage(ex),
      };
    }

    return null;
  }

  protected getRemainingTime(torrent: QBittorrentTorrent): number | null {
    if (torrent.eta < 0 || torrent.eta > 365 * 24 * 3600) {
      return null;
    }

    // qBittorrent sends eta=8640000 if unknown such as queued
    if (torrent.eta === 8640000) {
      return null;
    }

    return Math.trunc(torrent.eta) * 1000;
  }

  protected async hasReachedSeedLimit(
    torrent: QBittorrentTorrent,
    config: QBittorrentPreferences
  ): Promise<boolean> {
    if (torrent.ratio_limit >= 0) {
      if (torrent.ratio_limit - torrent.ratio <= 0.001) {
        return true;
      }
    } else if (torrent.ratio_limit === -2 && config.max_ratio_enabled) {
      if (config.max_ratio - torrent.ratio <= 0.001) {
        return true;
      }
    }

    if (
      (await this.hasReachedSeedingTimeLimit(torrent, config)) ||
      this.hasReachedInactiveSeedingTimeLimit(torrent, config)
    ) {
      return true;
    }

    return false;
  }

  /**
   * Ported from QBittorrent.HasReachedSeedingTimeLimit(): on a cache miss
   * (no `torrent.SeedingTime` from the list API, and no fresh cache entry),
   * fetches torrent details (`FetchTorrentDetails`) synchronously before
   * evaluating -- this port `await`s that same fetch rather than blocking,
   * since Node has no synchronous-block-on-network primitive; the
   * *sequencing* (fetch-then-decide, not "assume not reached") is preserved
   * exactly, unlike a version that would silently skip the fetch.
   */
  protected async hasReachedSeedingTimeLimit(
    torrent: QBittorrentTorrent,
    config: QBittorrentPreferences
  ): Promise<boolean> {
    let seedingTimeLimitSeconds: number;

    if (torrent.seeding_time_limit >= 0) {
      seedingTimeLimitSeconds = torrent.seeding_time_limit * 60;
    } else if (torrent.seeding_time_limit === -2 && config.max_seeding_time_enabled) {
      seedingTimeLimitSeconds = config.max_seeding_time * 60;
    } else {
      return false;
    }

    if (torrent.seeding_time != null) {
      // SeedingTime can't be available here, but use it if the api starts to provide it.
      return torrent.seeding_time >= seedingTimeLimitSeconds;
    }

    const cacheKey = this.settings.host + this.settings.port + torrent.hash;
    const cached = this.seedingTimeCache.get(cacheKey);

    if (cached) {
      const togo = seedingTimeLimitSeconds - cached.entry.seedingTimeSeconds;
      const elapsedSeconds = (this.now() - cached.entry.lastFetchedMs) / 1000;

      if (togo <= 0) {
        // Already reached the limit, keep the cache alive.
        this.seedingTimeCache.set(cacheKey, {
          entry: cached.entry,
          expiresAtMs: this.now() + 5 * 60 * 1000,
        });
        return true;
      } else if (togo > elapsedSeconds) {
        // SeedingTime cannot have reached the required value since the last
        // check, preserve the cache.
        this.seedingTimeCache.set(cacheKey, {
          entry: cached.entry,
          expiresAtMs: this.now() + 5 * 60 * 1000,
        });
        return false;
      }
    }

    const newSeedingTimeSeconds = await this.fetchTorrentDetails(torrent);

    const newEntry: SeedingTimeCacheEntry = {
      lastFetchedMs: this.now(),
      seedingTimeSeconds: newSeedingTimeSeconds,
    };
    this.seedingTimeCache.set(cacheKey, {
      entry: newEntry,
      expiresAtMs: this.now() + 5 * 60 * 1000,
    });

    if (newEntry.seedingTimeSeconds >= seedingTimeLimitSeconds) {
      // Reached the limit, keep the cache alive.
      return true;
    }

    return false;
  }

  /** Ported from QBittorrent.FetchTorrentDetails(): fetches torrent properties and returns `SeedingTime`. */
  protected async fetchTorrentDetails(torrent: QBittorrentTorrent): Promise<number> {
    const proxy = await this.proxy();
    const torrentProperties = await proxy.getTorrentProperties(torrent.hash, this.settings);
    return torrentProperties.seeding_time;
  }

  protected hasReachedInactiveSeedingTimeLimit(
    torrent: QBittorrentTorrent,
    config: QBittorrentPreferences
  ): boolean {
    let inactiveSeedingTimeLimitSeconds: number;

    if (torrent.inactive_seeding_time_limit >= 0) {
      inactiveSeedingTimeLimitSeconds = torrent.inactive_seeding_time_limit * 60;
    } else if (
      torrent.inactive_seeding_time_limit === -2 &&
      config.max_inactive_seeding_time_enabled
    ) {
      inactiveSeedingTimeLimitSeconds = config.max_inactive_seeding_time * 60;
    } else {
      return false;
    }

    return Math.trunc(this.now() / 1000) - torrent.last_activity > inactiveSeedingTimeLimitSeconds;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorMessage(ex: unknown): string {
  return ex instanceof Error ? ex.message : String(ex);
}

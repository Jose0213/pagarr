import type { IConfigService } from "../../config/configService.js";
import type { ValidationFailure } from "../../indexers/IIndexerSettings.js";
import { OsPath } from "../OsPath.js";
import { createDownloadClientInfo, type DownloadClientInfo } from "../DownloadClientInfo.js";
import {
  createDownloadClientItem,
  downloadClientItemClientInfoFromDownloadClient,
  type DownloadClientItem,
} from "../DownloadClientItem.js";
import { DownloadItemStatus } from "../DownloadItemStatus.js";
import { noopDownloadClientLogger, type DownloadClientLogger } from "../DownloadClientBase.js";
import type { IDiskProviderLike } from "../IDiskProviderLike.js";
import type { IRemotePathMappingService } from "../RemotePathMappingService.js";
import type { RemoteBookLike } from "../RemoteBookLike.js";
import {
  UsenetClientBase,
  type IValidateNzbs,
  permissiveNzbValidator,
} from "../UsenetClientBase.js";
import type { IHttpClient } from "../../http/HttpClient.js";
import type { SabnzbdCategory, SabnzbdConfig } from "./SabnzbdCategory.js";
import { SabnzbdDownloadStatus } from "./SabnzbdDownloadStatus.js";
import { SabnzbdPriority, sabnzbdPriorityFromWireName } from "./SabnzbdPriority.js";
import type { ISabnzbdProxy } from "./SabnzbdProxy.js";
import { parseSabnzbdQueueTime } from "./sabnzbdQueueTimeConverter.js";
import { parseSabnzbdStringArray } from "./sabnzbdStringArrayConverter.js";
import type { SabnzbdSettings } from "./SabnzbdSettings.js";
import { isRecentBook } from "../RemoteBookLike.js";

/**
 * Forward-ref for `DownloadClientRejectedReleaseException`
 * (`NzbDrone.Core/Exceptions/DownloadClientRejectedReleaseException.cs`,
 * from the not-yet-ported `NzbDrone.Core.Exceptions` module -- out of scope,
 * same situation as `ReleaseDownloadException`/`ReleaseUnavailableException`/
 * `ReleaseBlockedException` in TorrentClientBase.ts, whose doc comment this
 * mirrors).
 */
export class DownloadClientRejectedReleaseException extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DownloadClientRejectedReleaseException";
    Object.setPrototypeOf(this, DownloadClientRejectedReleaseException.prototype);
  }
}

/**
 * Ported from NzbDrone.Core/Download/Clients/Sabnzbd/Sabnzbd.cs.
 *
 * DEVIATION -- `HasVersion`/`ParseVersion` in C# use `System.Version` after
 * a regex-based parse; ported here via `compareSabVersions()`, a local
 * numeric-segment comparer over `{ major, minor, patch }` matching the same
 * `(?<major>\d+)\.(?<minor>\d+)\.(?<patch>\d+|x)` regex and "develop" special
 * case.
 */
export class Sabnzbd extends UsenetClientBase<SabnzbdSettings> {
  readonly name = "SABnzbd";

  private readonly proxy: ISabnzbdProxy;

  constructor(
    proxy: ISabnzbdProxy,
    httpClient: IHttpClient,
    configService: IConfigService,
    diskProvider: IDiskProviderLike,
    remotePathMappingService: IRemotePathMappingService,
    nzbValidationService: IValidateNzbs = permissiveNzbValidator,
    logger: DownloadClientLogger = noopDownloadClientLogger
  ) {
    super(
      httpClient,
      configService,
      diskProvider,
      remotePathMappingService,
      nzbValidationService,
      logger
    );
    this.proxy = proxy;
  }

  protected async addFromNzbFile(
    remoteBook: RemoteBookLike,
    filename: string,
    fileContent: Uint8Array
  ): Promise<string | null> {
    const category = this.settings.musicCategory;
    const priority = isRecentBook(remoteBook)
      ? this.settings.recentTvPriority
      : this.settings.olderTvPriority;

    const response = await this.proxy.downloadNzb(
      fileContent,
      filename,
      category,
      priority,
      this.settings
    );

    if (!response || response.nzo_ids.length === 0) {
      throw new DownloadClientRejectedReleaseException(
        "SABnzbd rejected the NZB for an unknown reason"
      );
    }

    return response.nzo_ids[0]!;
  }

  private async getQueue(): Promise<DownloadClientItem[]> {
    const sabQueue = await this.proxy.getQueue(0, 0, this.settings);
    const queueItems: DownloadClientItem[] = [];

    for (const sabQueueItem of sabQueue.slots) {
      if (sabQueueItem.status === SabnzbdDownloadStatus.Deleted) {
        continue;
      }

      const queueItem = createDownloadClientItem({
        downloadClientInfo: downloadClientItemClientInfoFromDownloadClient(this, false),
        downloadId: sabQueueItem.nzo_id,
        category: sabQueueItem.cat,
        title: sabQueueItem.filename,
        totalSize: Math.round(sabQueueItem.mb * 1024 * 1024),
        remainingSize: Math.round(sabQueueItem.mbleft * 1024 * 1024),
        remainingTime: parseSabnzbdQueueTime(sabQueueItem.timeleft),
        canBeRemoved: true,
        canMoveFiles: true,
      });

      const priority = sabnzbdPriorityFromWireName(sabQueueItem.priority);

      if (
        (sabQueue.paused && priority !== SabnzbdPriority.Force) ||
        sabQueueItem.status === SabnzbdDownloadStatus.Paused
      ) {
        queueItem.status = DownloadItemStatus.Paused;
        queueItem.remainingTime = null;
      } else if (
        sabQueueItem.status === SabnzbdDownloadStatus.Queued ||
        sabQueueItem.status === SabnzbdDownloadStatus.Grabbing ||
        sabQueueItem.status === SabnzbdDownloadStatus.Propagating
      ) {
        queueItem.status = DownloadItemStatus.Queued;
      } else {
        queueItem.status = DownloadItemStatus.Downloading;
      }

      if (queueItem.title.startsWith("ENCRYPTED /")) {
        queueItem.title = queueItem.title.slice(11);
        queueItem.isEncrypted = true;
      }

      queueItems.push(queueItem);
    }

    return queueItems;
  }

  private async getHistory(): Promise<DownloadClientItem[]> {
    const sabHistory = await this.proxy.getHistory(
      0,
      this.configService.downloadClientHistoryLimit,
      this.settings
    );

    const historyItems: DownloadClientItem[] = [];

    for (const sabHistoryItem of sabHistory.slots) {
      if (sabHistoryItem.status === SabnzbdDownloadStatus.Deleted) {
        continue;
      }

      const historyItem = createDownloadClientItem({
        downloadClientInfo: downloadClientItemClientInfoFromDownloadClient(this, false),
        downloadId: sabHistoryItem.nzo_id,
        category: sabHistoryItem.category,
        title: sabHistoryItem.name,

        totalSize: sabHistoryItem.bytes,
        remainingSize: 0,
        remainingTime: 0,

        message: sabHistoryItem.fail_message,

        canBeRemoved: true,
        canMoveFiles: true,
      });

      if (sabHistoryItem.status === SabnzbdDownloadStatus.Failed) {
        if (
          sabHistoryItem.fail_message &&
          sabHistoryItem.fail_message.trim() !== "" &&
          sabHistoryItem.fail_message.toLowerCase() ===
            "unpacking failed, write error or disk is full?"
        ) {
          historyItem.status = DownloadItemStatus.Warning;
        } else {
          historyItem.status = DownloadItemStatus.Failed;
        }
      } else if (sabHistoryItem.status === SabnzbdDownloadStatus.Completed) {
        historyItem.status = DownloadItemStatus.Completed;
      } else {
        // Verifying/Moving etc.
        historyItem.status = DownloadItemStatus.Downloading;
      }

      const outputPath = this.remotePathMappingService.remapRemoteToLocal(
        this.settings.host,
        new OsPath(sabHistoryItem.storage)
      );

      if (!outputPath.isEmpty) {
        historyItem.outputPath = outputPath;

        let parent = outputPath.directory;
        while (!parent.isEmpty) {
          if (parent.fileName === sabHistoryItem.name) {
            historyItem.outputPath = parent;
          }

          parent = parent.directory;
        }
      }

      historyItems.push(historyItem);
    }

    return historyItems;
  }

  async getItems(): Promise<DownloadClientItem[]> {
    const [queue, history] = await Promise.all([this.getQueue(), this.getHistory()]);
    const result: DownloadClientItem[] = [];

    for (const downloadClientItem of [...queue, ...history]) {
      if (
        downloadClientItem.category === this.settings.musicCategory ||
        (downloadClientItem.category === "*" &&
          (!this.settings.musicCategory || this.settings.musicCategory.trim() === ""))
      ) {
        result.push(downloadClientItem);
      }
    }

    return result;
  }

  async removeItem(item: DownloadClientItem, deleteData: boolean): Promise<void> {
    const queue = await this.getQueue();
    const queueClientItem = queue.find((v) => v.downloadId === item.downloadId);

    if (!queueClientItem) {
      if (deleteData && item.status === DownloadItemStatus.Completed) {
        await this.deleteItemData(item);
      }

      await this.proxy.removeFromHistory(
        item.downloadId,
        deleteData,
        item.status === DownloadItemStatus.Failed,
        this.settings
      );
    } else {
      await this.proxy.removeFromQueue(item.downloadId, deleteData, this.settings);
    }
  }

  protected async getCategories(config: SabnzbdConfig): Promise<SabnzbdCategory[]> {
    let completeDir = new OsPath(config.misc.complete_dir);

    if (!completeDir.isRooted) {
      if (await this.hasVersion(2, 0)) {
        const status = await this.proxy.getFullStatus(this.settings);
        completeDir = new OsPath(status.completedir);
      } else {
        const queue = await this.proxy.getQueue(0, 1, this.settings);
        const defaultRootFolder = new OsPath(queue.my_home);

        completeDir = defaultRootFolder.combine(completeDir);
      }
    }

    const result: SabnzbdCategory[] = [];
    for (const category of config.categories) {
      const relativeDir = new OsPath(category.dir.replace(/\*+$/, ""));

      result.push({ ...category, fullPath: completeDir.combine(relativeDir) });
    }

    return result;
  }

  async getStatus(): Promise<DownloadClientInfo> {
    const config = await this.proxy.getConfig(this.settings);
    const categories = await this.getCategories(config);

    let category = categories.find((v) => v.name === this.settings.musicCategory);

    if (!category) {
      category = categories.find((v) => v.name === "*");
    }

    const status = createDownloadClientInfo({
      isLocalhost: this.settings.host === "127.0.0.1" || this.settings.host === "localhost",
    });

    if (category) {
      status.outputRootFolders = [
        this.remotePathMappingService.remapRemoteToLocal(this.settings.host, category.fullPath),
      ];
    }

    status.removesCompletedDownloads = this.removesCompletedDownloads(config);

    return status;
  }

  protected async testConnection(failures: ValidationFailure[]): Promise<void> {
    const connectionFailure = await this.testConnectionAndVersion();
    if (connectionFailure) {
      failures.push(connectionFailure);
    }

    const authFailure = await this.testAuthentication();
    if (authFailure) {
      failures.push(authFailure);
    }

    const globalConfigFailure = await this.testGlobalConfig();
    if (globalConfigFailure) {
      failures.push(globalConfigFailure);
    }

    const categoryFailure = await this.testCategory();
    if (categoryFailure) {
      failures.push(categoryFailure);
    }
  }

  private async hasVersion(major: number, minor: number, patch = 0): Promise<boolean> {
    const rawVersion = await this.proxy.getVersion(this.settings);
    const version = parseSabVersion(rawVersion);

    if (version === null) {
      return false;
    }

    if (version.major > major) {
      return true;
    } else if (version.major < major) {
      return false;
    }

    if (version.minor > minor) {
      return true;
    } else if (version.minor < minor) {
      return false;
    }

    if (version.patch > patch) {
      return true;
    } else if (version.patch < patch) {
      return false;
    }

    return true;
  }

  private async testConnectionAndVersion(): Promise<ValidationFailure | null> {
    try {
      const rawVersion = await this.proxy.getVersion(this.settings);
      const version = parseSabVersion(rawVersion);

      if (version === null) {
        return { propertyName: "Version", errorMessage: "Unknown Version: " + rawVersion };
      }

      if (rawVersion.toLowerCase() === "develop") {
        return {
          propertyName: "Version",
          errorMessage: "Sabnzbd develop version, assuming version 3.0.0 or higher.",
          isWarning: true,
          detailedDescription:
            "Pagarr may not be able to support new features added to SABnzbd when running develop versions.",
        };
      }

      if (version.major >= 1) {
        return null;
      }

      if (version.minor >= 7) {
        return null;
      }

      return {
        propertyName: "Version",
        errorMessage: `Version 0.7.0+ is required, but found: ${version.major}.${version.minor}.${version.patch}`,
      };
    } catch (ex) {
      this.logger.error(errorMessage(ex), ex);
      return {
        propertyName: "Host",
        errorMessage: "Unable to connect to SABnzbd",
        detailedDescription: errorMessage(ex),
      };
    }
  }

  private async testAuthentication(): Promise<ValidationFailure | null> {
    try {
      await this.proxy.getConfig(this.settings);
    } catch (ex) {
      const msg = errorMessage(ex);
      if (msg.toLowerCase().includes("api key incorrect")) {
        return { propertyName: "APIKey", errorMessage: "API Key Incorrect" };
      }

      if (msg.toLowerCase().includes("api key required")) {
        return { propertyName: "APIKey", errorMessage: "API Key Required" };
      }

      throw ex;
    }

    return null;
  }

  private async testGlobalConfig(): Promise<ValidationFailure | null> {
    const config = await this.proxy.getConfig(this.settings);
    if (config.misc.pre_check && !(await this.hasVersion(1, 1))) {
      return {
        propertyName: "",
        errorMessage: "Disable 'Check before download' option in Sabnbzd",
        detailedDescription:
          "Using Check before download affects Pagarr ability to track new downloads. Also Sabnzbd recommends 'Abort jobs that cannot be completed' instead since it's more effective.",
      };
    }

    return null;
  }

  private async testCategory(): Promise<ValidationFailure | null> {
    const config = await this.proxy.getConfig(this.settings);
    const categories = await this.getCategories(config);
    const category = categories.find((v) => v.name === this.settings.musicCategory);

    if (category) {
      if (category.dir.endsWith("*")) {
        return {
          propertyName: "MusicCategory",
          errorMessage: "Enable Job folders",
          detailedDescription:
            "Pagarr prefers each download to have a separate folder. With * appended to the Folder/Path Sabnzbd will not create these job folders. Go to Sabnzbd to fix it.",
        };
      }
    } else if (this.settings.musicCategory && this.settings.musicCategory.trim() !== "") {
      return {
        propertyName: "MusicCategory",
        errorMessage: "Category does not exist",
        detailedDescription:
          "The Category your entered doesn't exist in Sabnzbd. Go to Sabnzbd to create it.",
      };
    }

    if (
      config.misc.enable_tv_sorting &&
      containsCategory(
        parseSabnzbdStringArray(config.misc.tv_categories),
        this.settings.musicCategory
      )
    ) {
      return {
        propertyName: "MusicCategory",
        errorMessage: "Disable TV Sorting",
        detailedDescription:
          "You must disable Sabnzbd TV Sorting for the category Pagarr uses to prevent import issues. Go to Sabnzbd to fix it.",
      };
    }

    if (
      config.misc.enable_movie_sorting &&
      containsCategory(
        parseSabnzbdStringArray(config.misc.movie_categories),
        this.settings.musicCategory
      )
    ) {
      return {
        propertyName: "MusicCategory",
        errorMessage: "Disable Movie Sorting",
        detailedDescription:
          "You must disable Sabnzbd Movie Sorting for the category Pagarr uses to prevent import issues. Go to Sabnzbd to fix it.",
      };
    }

    if (
      config.misc.enable_date_sorting &&
      containsCategory(
        parseSabnzbdStringArray(config.misc.date_categories),
        this.settings.musicCategory
      )
    ) {
      return {
        propertyName: "MusicCategory",
        errorMessage: "Disable Date Sorting",
        detailedDescription:
          "You must disable Sabnzbd Date Sorting for the category Pagarr uses to prevent import issues. Go to Sabnzbd to fix it.",
      };
    }

    return null;
  }

  private removesCompletedDownloads(config: SabnzbdConfig): boolean {
    const retention = config.misc.history_retention;
    const option = config.misc.history_retention_option;
    const number = config.misc.history_retention_number;

    switch (option) {
      case "all":
        return false;
      case "number-archive":
      case "number-delete":
        return true;
      case "days-archive":
      case "days-delete":
        return number < 14;
      case "all-archive":
      case "all-delete":
        return true;
      default:
        break;
    }

    // TODO: Remove these checks once support for SABnzbd < 4.3 is removed.
    if (!retention || retention.trim() === "") {
      return false;
    }

    if (retention.endsWith("d")) {
      const daysRetention = Number.parseInt(retention.slice(0, -1), 10);
      return !Number.isNaN(daysRetention) && daysRetention < 14;
    }

    return retention !== "0";
  }
}

function containsCategory(categories: string[] | null | undefined, category: string): boolean {
  if (!categories || categories.length === 0) {
    return true;
  }

  const effectiveCategory = !category || category.trim() === "" ? "Default" : category;

  return categories.includes(effectiveCategory);
}

interface SabVersion {
  major: number;
  minor: number;
  patch: number;
}

/**
 * Ported from Sabnzbd.ParseVersion(): matches
 * `(?<major>\d+)\.(?<minor>\d+)\.(?<patch>\d+|x)` (patch can be a number, or
 * `x` for git builds, treated as 0), with a "develop" special case (3.0.0).
 */
const VERSION_REGEX = /(?<major>\d+)\.(?<minor>\d+)\.(?<patch>\d+|x)/;

function parseSabVersion(version: string): SabVersion | null {
  if (!version || version.trim() === "") {
    return null;
  }

  const match = VERSION_REGEX.exec(version);

  if (match?.groups) {
    return {
      major: Number.parseInt(match.groups.major!, 10),
      minor: Number.parseInt(match.groups.minor!, 10),
      patch: Number.parseInt(match.groups.patch!.replace("x", "0"), 10),
    };
  }

  if (version.toLowerCase() !== "develop") {
    return null;
  }

  return { major: 3, minor: 0, patch: 0 };
}

function errorMessage(ex: unknown): string {
  return ex instanceof Error ? ex.message : String(ex);
}

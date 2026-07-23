import type { IConfigService } from "../../config/configService.js";
import type { ValidationFailure } from "../../indexers/IIndexerSettings.js";
import type { IHttpClient } from "../../http/HttpClient.js";
import { noopDownloadClientLogger, type DownloadClientLogger } from "../DownloadClientBase.js";
import { createDownloadClientInfo, type DownloadClientInfo } from "../DownloadClientInfo.js";
import {
  createDownloadClientItem,
  downloadClientItemClientInfoFromDownloadClient,
  type DownloadClientItem,
} from "../DownloadClientItem.js";
import type { IDiskProviderLike } from "../IDiskProviderLike.js";
import { OsPath } from "../OsPath.js";
import type { IRemotePathMappingService } from "../RemotePathMappingService.js";
import type { RemoteBookLike } from "../RemoteBookLike.js";
import { MagnetNotSupportedError, TorrentClientBase } from "../TorrentClientBase.js";
import { cleanFileName } from "../fileNameCleaner.js";
import type { IScanWatchFolder } from "./ScanWatchFolder.js";
import type { TorrentBlackholeSettings } from "./TorrentBlackholeSettings.js";

/**
 * Ported from NzbDrone.Core/Download/Clients/Blackhole/TorrentBlackhole.cs.
 * A watch-folder-based torrent client with no API: adds by writing a
 * `.torrent`/magnet-link file, tracks progress by scanning a watch folder.
 */
export class TorrentBlackhole extends TorrentClientBase<TorrentBlackholeSettings> {
  readonly name = "Torrent Blackhole";

  private readonly scanWatchFolder: IScanWatchFolder;

  /** Milliseconds, matching C#'s `TimeSpan ScanGracePeriod` (default 30s). */
  scanGracePeriodMs = 30_000;

  override get preferTorrentFile(): boolean {
    return true;
  }

  constructor(
    scanWatchFolder: IScanWatchFolder,
    httpClient: IHttpClient,
    configService: IConfigService,
    diskProvider: IDiskProviderLike,
    remotePathMappingService: IRemotePathMappingService,
    logger: DownloadClientLogger = noopDownloadClientLogger
  ) {
    super(httpClient, configService, diskProvider, remotePathMappingService, undefined, logger);
    this.scanWatchFolder = scanWatchFolder;
  }

  protected async addFromMagnetLink(
    remoteBook: RemoteBookLike,
    _hash: string,
    magnetLink: string
  ): Promise<string | null> {
    if (!this.settings.saveMagnetFiles) {
      throw new MagnetNotSupportedError("Blackhole does not support magnet links.");
    }

    const title = cleanFileName(remoteBook.release.title);

    const filepath = joinPath(
      this.settings.torrentFolder,
      `${title}.${this.settings.magnetFileExtension.replace(/^\.+|\.+$/g, "")}`
    );

    const fileContent = new TextEncoder().encode(magnetLink);
    const stream = await this.diskProvider.openWriteStream(filepath);
    await writeAndEnd(stream, fileContent);

    this.logger.debug("Saving magnet link succeeded, saved to: %s", filepath);

    return null;
  }

  protected async addFromTorrentFile(
    remoteBook: RemoteBookLike,
    _hash: string,
    _filename: string,
    fileContent: Uint8Array
  ): Promise<string | null> {
    const title = cleanFileName(remoteBook.release.title);

    const filepath = joinPath(this.settings.torrentFolder, `${title}.torrent`);

    const stream = await this.diskProvider.openWriteStream(filepath);
    await writeAndEnd(stream, fileContent);

    this.logger.debug("Torrent Download succeeded, saved to: %s", filepath);

    return null;
  }

  async getItems(): Promise<DownloadClientItem[]> {
    const watchItems = await this.scanWatchFolder.getItems(
      this.settings.watchFolder,
      this.scanGracePeriodMs
    );

    return watchItems.map((item) =>
      createDownloadClientItem({
        downloadClientInfo: downloadClientItemClientInfoFromDownloadClient(this, false),
        downloadId: `${this.definition.name}_${item.downloadId}`,
        category: "Readarr",
        title: item.title,

        totalSize: item.totalSize,
        remainingTime: item.remainingTime,

        outputPath: item.outputPath,

        status: item.status,

        canMoveFiles: !this.settings.readOnly,
        canBeRemoved: !this.settings.readOnly,
      })
    );
  }

  async removeItem(item: DownloadClientItem, deleteData: boolean): Promise<void> {
    if (!deleteData) {
      throw new Error(
        "Blackhole cannot remove DownloadItem without deleting the data as well, ignoring."
      );
    }

    await this.deleteItemData(item);
  }

  getStatus(): DownloadClientInfo {
    return createDownloadClientInfo({
      isLocalhost: true,
      outputRootFolders: [new OsPath(this.settings.watchFolder)],
    });
  }

  protected async testConnection(failures: ValidationFailure[]): Promise<void> {
    const torrentFolderFailure = await this.testFolder(
      this.settings.torrentFolder,
      "TorrentFolder"
    );
    if (torrentFolderFailure) {
      failures.push(torrentFolderFailure);
    }

    const watchFolderFailure = await this.testFolder(this.settings.watchFolder, "WatchFolder");
    if (watchFolderFailure) {
      failures.push(watchFolderFailure);
    }
  }
}

function joinPath(dir: string, name: string): string {
  const sep = dir.includes("\\") ? "\\" : "/";
  return dir.replace(/[\\/]+$/, "") + sep + name;
}

function writeAndEnd(stream: NodeJS.WritableStream, data: Uint8Array): Promise<void> {
  return new Promise((resolve, reject) => {
    stream.write(Buffer.from(data), (err) => {
      if (err) {
        reject(err);
        return;
      }
      stream.end(() => resolve());
    });
  });
}

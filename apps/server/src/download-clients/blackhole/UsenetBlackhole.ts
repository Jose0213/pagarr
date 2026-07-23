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
import {
  UsenetClientBase,
  type IValidateNzbs,
  permissiveNzbValidator,
} from "../UsenetClientBase.js";
import { cleanFileName } from "../fileNameCleaner.js";
import type { IScanWatchFolder } from "./ScanWatchFolder.js";
import type { UsenetBlackholeSettings } from "./UsenetBlackholeSettings.js";

/**
 * Ported from NzbDrone.Core/Download/Clients/Blackhole/UsenetBlackhole.cs.
 * A watch-folder-based usenet client with no API: adds by writing a `.nzb`
 * file, tracks progress by scanning a watch folder.
 */
export class UsenetBlackhole extends UsenetClientBase<UsenetBlackholeSettings> {
  readonly name = "Usenet Blackhole";

  private readonly scanWatchFolder: IScanWatchFolder;

  /** Milliseconds, matching C#'s `TimeSpan ScanGracePeriod` (default 30s). */
  scanGracePeriodMs = 30_000;

  constructor(
    scanWatchFolder: IScanWatchFolder,
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
    this.scanWatchFolder = scanWatchFolder;
  }

  protected async addFromNzbFile(
    remoteBook: RemoteBookLike,
    _filename: string,
    fileContent: Uint8Array
  ): Promise<string | null> {
    const title = cleanFileName(remoteBook.release.title);

    const filepath = joinPath(this.settings.nzbFolder, `${title}.nzb`);

    const stream = await this.diskProvider.openWriteStream(filepath);
    await writeAndEnd(stream, fileContent);

    this.logger.debug("NZB Download succeeded, saved to: %s", filepath);

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

        canBeRemoved: true,
        canMoveFiles: true,
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
    const nzbFolderFailure = await this.testFolder(this.settings.nzbFolder, "NzbFolder");
    if (nzbFolderFailure) {
      failures.push(nzbFolderFailure);
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

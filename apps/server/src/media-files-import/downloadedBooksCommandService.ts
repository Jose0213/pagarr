import type { ImportMode } from "./importMode.js";
import { ImportResultType } from "./importResultType.js";
import type { ImportResult } from "./bookImport/importResult.js";
import type { IDownloadedBooksImportService } from "./downloadedBooksImportService.js";
import type { IMediaFileDiskProvider } from "./mediaFileDiskProvider.js";
import {
  type CompletedDownloadVerifier,
  type TrackedDownloadLookup,
} from "./bookImport/manual/trackedDownloadLike.js";

/**
 * Forward-reference for `NzbDrone.Core/MediaFiles/Commands/DownloadedBooksScanCommand.cs`
 * (Messaging module command shape -- Phase 4 not ported, same substitution
 * as `manual/manualImportCommand.ts`'s doc comment).
 */
export interface DownloadedBooksScanCommand {
  path: string;
  downloadClientId: string | null;
  importMode: ImportMode;
}

/**
 * Forward-reference for `NzbDrone.Core/Messaging/Commands/ICommandResultReporter.cs`,
 * narrowed to the one member `Execute` calls.
 */
export interface CommandResultReporter {
  reportUnsuccessful(): void;
}

/**
 * Ported from NzbDrone.Core/MediaFiles/DownloadedBooksCommandService.cs.
 *
 * `Execute` is `async` because `IDownloadedBooksImportService.processPath`
 * (this module's own, already-ported `downloadedBooksImportService.ts`)
 * is Promise-based -- see that file's doc comment for why.
 * `IExecute<DownloadedBooksScanCommand>.Execute` (Messaging module,
 * Phase 4) is ported as a plain public async method rather than a real
 * command-bus subscription, same substitution as
 * `manual/manualImportService.ts`'s doc comment on `Execute`.
 */
export class DownloadedBooksCommandService {
  constructor(
    private readonly downloadedTracksImportService: IDownloadedBooksImportService,
    private readonly trackedDownloadService: TrackedDownloadLookup,
    private readonly diskProvider: IMediaFileDiskProvider,
    private readonly completedDownloadService: CompletedDownloadVerifier,
    private readonly commandResultReporter: CommandResultReporter,
    /** Stand-in for NLog `_logger.Warn(...)` -- see monitorNewBookService.ts's doc comment for why this codebase omits NLog. Defaults to a no-op. */
    private readonly onWarn: (message: string) => void = () => {}
  ) {}

  private async processPath(message: DownloadedBooksScanCommand): Promise<ImportResult[]> {
    if (
      !this.diskProvider.folderExists(message.path) &&
      !this.diskProvider.fileExists(message.path)
    ) {
      this.onWarn(`Folder/File specified for import scan [${message.path}] doesn't exist.`);
      return [];
    }

    if (message.downloadClientId !== null && message.downloadClientId.trim() !== "") {
      const trackedDownload = this.trackedDownloadService.find(message.downloadClientId);

      if (trackedDownload !== undefined) {
        const importResults = await this.downloadedTracksImportService.processPath(
          message.path,
          message.importMode,
          trackedDownload.remoteBook?.author ?? null,
          trackedDownload.downloadItem
        );

        this.completedDownloadService.verifyImport(trackedDownload, importResults);

        return importResults;
      }

      this.onWarn(
        `External directory scan request for unknown download ${message.downloadClientId}, attempting normal import. [${message.path}]`
      );
    }

    return this.downloadedTracksImportService.processPath(message.path, message.importMode);
  }

  async execute(message: DownloadedBooksScanCommand): Promise<void> {
    let importResults: ImportResult[];

    if (message.path.trim() !== "") {
      importResults = await this.processPath(message);
    } else {
      throw new Error("A path must be provided");
    }

    if (
      importResults.length === 0 ||
      importResults.every((v) => v.result !== ImportResultType.Imported)
    ) {
      // Allow the command to complete successfully, but report as unsuccessful
      this.commandResultReporter.reportUnsuccessful();
    }
  }
}

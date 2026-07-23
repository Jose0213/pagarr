import { DownloadCompletedEvent } from "./events.js";
import { BookImportIncompleteEvent } from "./bookImportIncompleteEvent.js";
import { isOutputPathEmpty, DownloadItemStatus } from "./downloadClients.js";
import type { OsPath } from "../download-clients/OsPath.js";
import { EntityHistoryEventType, type HistoryServiceLike } from "./entityHistory.js";
import type { IProvideImportItemService } from "./provideImportItemService.js";
import {
  ImportMode,
  ImportResultType,
  type IDownloadedBooksImportService,
  type ImportResult,
} from "./mediaFilesImport.js";
import type { ITrackedDownloadAlreadyImported } from "./tracked-downloads/trackedDownloadAlreadyImported.js";
import {
  TrackedDownloadState,
  warnTrackedDownload,
  warnTrackedDownloadFormatted,
  type TrackedDownload,
} from "./tracked-downloads/trackedDownload.js";
import { newTrackedDownloadStatusMessage } from "./tracked-downloads/trackedDownloadStatusMessage.js";
/**
 * Ported from NzbDrone.Core/Download/CompletedDownloadService.cs.
 *
 * DEVIATIONS:
 *  - `OsInfo.IsWindows` -- `ValidatePath` uses `process.platform`-driven
 *    detection (matching `root-folders/path-utils.ts`'s convention for the
 *    same kind of check) instead of a ported `OsInfo` module; the C#
 *    `downloadItemOutputPath.IsWindowsPath`/`IsUnixPath` calls themselves
 *    now go straight to the real `OsPath` class (download-clients/OsPath.ts,
 *    re-exported via downloadClients.ts) since `DownloadClientItem.outputPath`
 *    is a real `OsPath` instance, not a plain path string.
 *  - No NLog Logger -- per this port's no-NLog-yet convention
 *    (`_logger.Debug`/`.ForDebugEvent()...WriteSentryWarn` calls omitted).
 *  - `Check`/`Import` are synchronous in C#; ported here as `async` because
 *    `setImportItem` now awaits the real `IProvideImportItemService.
 *    provideImportItem` (provideImportItemService.ts), which itself awaits
 *    the real `IDownloadClient.getImportItem` -- `Promise<DownloadClientItem>
 *    | DownloadClientItem` on the real download-clients port (wider than C#'s
 *    synchronous `GetImportItem`, see that interface's doc comment). Callers
 *    (`DownloadMonitoringService.processClientItem`, `DownloadProcessingService.
 *    execute`) now `await` these too.
 */
export interface ICompletedDownloadService {
  check(trackedDownload: TrackedDownload): Promise<void>;
  import(trackedDownload: TrackedDownload): Promise<void>;
  verifyImport(trackedDownload: TrackedDownload, importResults: ImportResult[]): boolean;
}

export interface CompletedDownloadEventAggregatorLike {
  publishEvent(event: DownloadCompletedEvent | BookImportIncompleteEvent): void;
}

export class CompletedDownloadService implements ICompletedDownloadService {
  constructor(
    private readonly eventAggregator: CompletedDownloadEventAggregatorLike,
    private readonly historyService: HistoryServiceLike,
    private readonly provideImportItemService: IProvideImportItemService,
    private readonly downloadedBooksImportService: IDownloadedBooksImportService,
    private readonly trackedDownloadAlreadyImported: ITrackedDownloadAlreadyImported
  ) {}

  async check(trackedDownload: TrackedDownload): Promise<void> {
    if (trackedDownload.downloadItem.status !== DownloadItemStatus.Completed) {
      return;
    }

    await this.setImportItem(trackedDownload);

    // Only process tracked downloads that are still downloading.
    if (trackedDownload.state !== TrackedDownloadState.Downloading) {
      return;
    }

    const historyItem = this.historyService.mostRecentForDownloadId(
      trackedDownload.downloadItem.downloadId
    );

    if (
      historyItem === null &&
      (!trackedDownload.downloadItem.category ||
        trackedDownload.downloadItem.category.trim() === "")
    ) {
      warnTrackedDownloadFormatted(
        trackedDownload,
        "Download wasn't grabbed by Readarr and not in a category, Skipping."
      );
      return;
    }

    if (!this.validatePath(trackedDownload)) {
      return;
    }

    trackedDownload.state = TrackedDownloadState.ImportPending;
  }

  async import(trackedDownload: TrackedDownload): Promise<void> {
    await this.setImportItem(trackedDownload);

    if (!this.validatePath(trackedDownload)) {
      return;
    }

    trackedDownload.state = TrackedDownloadState.Importing;

    const outputPath = trackedDownload.importItem!.outputPath.fullPath;
    const importResults = this.downloadedBooksImportService.processPath(
      outputPath,
      ImportMode.Auto,
      trackedDownload.remoteBook?.author ?? null,
      trackedDownload.downloadItem
    );

    if (importResults.length === 0) {
      warnTrackedDownloadFormatted(
        trackedDownload,
        "No files found are eligible for import in {0}",
        outputPath
      );
      trackedDownload.state = TrackedDownloadState.ImportPending;
      return;
    }

    if (this.verifyImport(trackedDownload, importResults)) {
      return;
    }

    trackedDownload.state = TrackedDownloadState.ImportPending;

    if (importResults.some((c) => c.result !== ImportResultType.Imported)) {
      trackedDownload.state = TrackedDownloadState.ImportFailed;

      const statusMessages = importResults
        .filter((v) => v.result !== ImportResultType.Imported && v.importDecision.item !== null)
        .map((v) =>
          newTrackedDownloadStatusMessage(fileNameFromPath(v.importDecision.item.path), v.errors)
        );

      warnTrackedDownload(trackedDownload, statusMessages);
      this.eventAggregator.publishEvent(new BookImportIncompleteEvent(trackedDownload));
      return;
    }
  }

  verifyImport(trackedDownload: TrackedDownload, importResults: ImportResult[]): boolean {
    const importedCount = importResults.filter(
      (c) => c.result === ImportResultType.Imported
    ).length;
    const allItemsImported =
      importedCount >= Math.max(1, trackedDownload.remoteBook?.books.length ?? 1);

    if (allItemsImported) {
      trackedDownload.state = TrackedDownloadState.Imported;

      const importedAuthorId = mostCommon(
        importResults
          .filter((x) => x.result === ImportResultType.Imported)
          .map((c) => c.importDecision.item.author.id)
      );

      this.eventAggregator.publishEvent(
        new DownloadCompletedEvent(
          trackedDownload,
          trackedDownload.remoteBook?.author?.id ?? importedAuthorId ?? 0
        )
      );
      return true;
    }

    // Double check if all books were imported by checking the history if at
    // least one file was imported. This allows the decision engine to
    // reject already-imported book files and still mark the download
    // complete when all files are imported.
    //
    // C# computes `atLeastOneEpisodeImported` here purely to pick between
    // two different debug-log messages on the `allEpisodesImportedInHistory`
    // branch below -- both branches are otherwise behaviorally identical
    // (both mark the download Imported and publish the same event). Since
    // this port omits NLog calls entirely (see class doc comment), that
    // value has no observable effect and isn't computed here.

    const historyItems = this.historyService
      .findByDownloadId(trackedDownload.downloadItem.downloadId)
      .slice()
      .sort((a, b) => b.date.localeCompare(a.date));

    const allImportedInHistory = this.trackedDownloadAlreadyImported.isImported(
      trackedDownload,
      historyItems
    );

    if (allImportedInHistory) {
      trackedDownload.state = TrackedDownloadState.Imported;

      const importedAuthorId = mostCommon(
        historyItems
          .filter((x) => x.eventType === EntityHistoryEventType.BookFileImported)
          .map((x) => x.authorId)
      );

      this.eventAggregator.publishEvent(
        new DownloadCompletedEvent(
          trackedDownload,
          trackedDownload.remoteBook?.author?.id ?? importedAuthorId ?? 0
        )
      );

      return true;
    }

    return false;
  }

  private async setImportItem(trackedDownload: TrackedDownload): Promise<void> {
    trackedDownload.importItem = await this.provideImportItemService.provideImportItem(
      trackedDownload.downloadItem,
      trackedDownload.importItem
    );
  }

  private validatePath(trackedDownload: TrackedDownload): boolean {
    const importItem = trackedDownload.importItem;
    if (importItem === null) {
      return false;
    }

    if (isOutputPathEmpty(importItem)) {
      warnTrackedDownloadFormatted(
        trackedDownload,
        "Download doesn't contain intermediate path, Skipping."
      );
      return false;
    }

    const outputOsPath: OsPath = importItem.outputPath;
    const isCurrentOsPlatform = process.platform === "win32";
    const matchesCurrentOs = isCurrentOsPlatform
      ? outputOsPath.isWindowsPath
      : outputOsPath.isUnixPath;

    if (!outputOsPath.isRooted || !matchesCurrentOs) {
      warnTrackedDownloadFormatted(
        trackedDownload,
        "[{0}] is not a valid local path. You may need a Remote Path Mapping.",
        importItem.outputPath.fullPath
      );
      return false;
    }

    return true;
  }
}

/** Ported from `IEnumerableExtensions.MostCommon<TSource>`: the most frequent value, or `undefined` for an empty sequence (C# would throw `InvalidOperationException` on `.First()` over an empty sequence -- this port's call sites already guard emptiness the same way the C# ones implicitly do via `allItemsImported`/`allImportedInHistory` being true, so the input is never actually empty at either call site; `undefined` here is a defensive fallback, not a silently-different behavior). */
function mostCommon<T>(items: T[]): T | undefined {
  if (items.length === 0) {
    return undefined;
  }
  const counts = new Map<T, number>();
  for (const item of items) {
    counts.set(item, (counts.get(item) ?? 0) + 1);
  }
  let best: T | undefined;
  let bestCount = -1;
  for (const [item, count] of counts) {
    if (count > bestCount) {
      best = item;
      bestCount = count;
    }
  }
  return best;
}

function fileNameFromPath(path: string): string {
  const idx = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return idx === -1 ? path : path.slice(idx + 1);
}

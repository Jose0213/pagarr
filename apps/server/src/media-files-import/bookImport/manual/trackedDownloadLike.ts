import type { RemoteBook } from "../../../decision-engine/remoteBook.js";
import type { DownloadClientItemLike } from "../importDecisionEngineSpecification.js";

/**
 * Forward-reference for `NzbDrone.Core/Download/TrackedDownloads/TrackedDownload.cs`
 * (the `download-tracking` sibling worktree, not merged into this
 * worktree yet -- see this module's task brief). Narrowed to the exact
 * fields `ManualImportService`/`DownloadedBooksCommandService` read:
 * `DownloadItem`, `RemoteBook`, `ImportItem`, `State`. Field names/shape
 * copied 1:1 from the real C# class so the eventual swap to the real type
 * is mechanical.
 */
export interface TrackedDownloadLike {
  downloadItem: DownloadClientItemLike;
  remoteBook?: RemoteBook;
  importItem?: { outputPath: { fullPath: string } };
  state: TrackedDownloadStateLike;
}

/**
 * Forward-reference for `NzbDrone.Core/Download/TrackedDownloads/TrackedDownloadState.cs`,
 * narrowed to the one member this module's own code assigns
 * (`Imported`).
 */
export enum TrackedDownloadStateLike {
  Downloading = "Downloading",
  ImportPending = "ImportPending",
  Importing = "Importing",
  Imported = "Imported",
  ImportFailed = "ImportFailed",
  Failed = "Failed",
  Ignored = "Ignored",
}

/**
 * Forward-reference for `ITrackedDownloadService.Find(string downloadId)`
 * (`download-tracking` sibling worktree).
 */
export interface TrackedDownloadLookup {
  find(downloadId: string): TrackedDownloadLike | undefined;
}

/**
 * Forward-reference for `NzbDrone.Core/Download/ICompletedDownloadService.VerifyImport`
 * (`download-clients` sibling worktree).
 */
export interface CompletedDownloadVerifier {
  verifyImport(trackedDownload: TrackedDownloadLike, importResults: unknown[]): void;
}

/**
 * Forward-reference for `NzbDrone.Core/MediaFiles/DownloadedBooksImportService.cs`'s
 * `IProvideImportItemService.ProvideImportItem` dependency (Download
 * module -- `download-clients` sibling worktree).
 */
export interface ImportItemProvider {
  provideImportItem(
    downloadItem: DownloadClientItemLike,
    previousImportItem: unknown
  ): { outputPath: { fullPath: string } };
}

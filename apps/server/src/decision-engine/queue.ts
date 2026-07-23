import type { RemoteBook } from "./remoteBook.js";

/**
 * Forward-refs for the `Queue`/`Download.TrackedDownloads` modules (Phase 3/4,
 * not ported yet) -- see remoteBook.ts's header comment for the general
 * approach. Only the slice QueueSpecification actually reads.
 */

/** Ported from NzbDrone.Core/Download/TrackedDownloads/TrackedDownload.cs's `TrackedDownloadState` enum. */
export enum TrackedDownloadState {
  Downloading = "Downloading",
  DownloadFailed = "DownloadFailed",
  DownloadFailedPending = "DownloadFailedPending",
  ImportPending = "ImportPending",
  Importing = "Importing",
  ImportFailed = "ImportFailed",
  Imported = "Imported",
  Ignored = "Ignored",
}

/** Forward-ref for the slice of NzbDrone.Core/Queue/Queue.cs DecisionEngine reads. */
export interface QueueItem {
  id: number;
  remoteBook: RemoteBook | null;
  size: number;
  trackedDownloadState: TrackedDownloadState | null;
}

/** Forward-ref for the slice of NzbDrone.Core/Queue/IQueueService.cs DecisionEngine calls. */
export interface QueueServiceLike {
  getQueue(): QueueItem[];
}

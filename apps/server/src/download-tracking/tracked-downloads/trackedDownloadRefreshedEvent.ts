import type { TrackedDownload } from "./trackedDownload.js";

/** Ported from NzbDrone.Core/Download/TrackedDownloads/TrackedDownloadRefreshedEvent.cs. */
export class TrackedDownloadRefreshedEvent {
  constructor(public readonly trackedDownloads: TrackedDownload[]) {}
}

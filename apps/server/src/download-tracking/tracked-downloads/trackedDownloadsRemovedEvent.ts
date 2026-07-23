import type { TrackedDownload } from "./trackedDownload.js";

/** Ported from NzbDrone.Core/Download/TrackedDownloads/TrackedDownloadsRemovedEvent.cs. */
export class TrackedDownloadsRemovedEvent {
  constructor(public readonly trackedDownloads: TrackedDownload[]) {}
}

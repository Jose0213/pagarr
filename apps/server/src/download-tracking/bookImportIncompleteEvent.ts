import type { TrackedDownload } from "./tracked-downloads/trackedDownload.js";

/** Ported from NzbDrone.Core/MediaFiles/Events/BookImportIncompleteEvent.cs. Real port (not a forward-ref) -- this module owns `TrackedDownload`, and `CompletedDownloadService.Import` (this module's real C# source) is the event's sole publisher. */
export class BookImportIncompleteEvent {
  constructor(public readonly trackedDownload: TrackedDownload) {}
}

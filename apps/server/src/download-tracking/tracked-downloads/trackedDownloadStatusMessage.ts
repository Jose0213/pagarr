/** Ported from NzbDrone.Core/Download/TrackedDownloads/TrackedDownloadStatusMessage.cs. */
export interface TrackedDownloadStatusMessage {
  title: string;
  messages: string[];
}

/** Ported from the `TrackedDownloadStatusMessage(string title, List<string> messages)` constructor. */
export function newTrackedDownloadStatusMessage(
  title: string,
  messages: string | string[]
): TrackedDownloadStatusMessage {
  return { title, messages: Array.isArray(messages) ? messages : [messages] };
}

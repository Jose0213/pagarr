import type { DownloadProtocol } from "../../indexers/DownloadProtocol.js";
import type { RemoteBook } from "../../parser/model/remoteBook.js";
import type { DownloadClientItem } from "../downloadClients.js";
import {
  newTrackedDownloadStatusMessage,
  type TrackedDownloadStatusMessage,
} from "./trackedDownloadStatusMessage.js";

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

/** Ported from NzbDrone.Core/Download/TrackedDownloads/TrackedDownload.cs's `TrackedDownloadStatus` enum. */
export enum TrackedDownloadStatus {
  Ok = "Ok",
  Warning = "Warning",
  Error = "Error",
}

/**
 * Ported from NzbDrone.Core/Download/TrackedDownloads/TrackedDownload.cs.
 *
 * C#'s `Status` and `StatusMessages` are get-only properties, settable only
 * via `Warn(...)` (see `warnTrackedDownload` below) -- ported as a plain
 * mutable class with those two fields still present (not truly private),
 * since this port's established convention elsewhere for "get-only in C#,
 * mutated only through one method" is a plain field plus a same-named free
 * function that performs the mutation (matching e.g.
 * profiles/delay/delayProfileService.ts's in-place `.order` mutations) --
 * TS interfaces have no access-control mechanism to actually enforce
 * private-setter semantics on plain data.
 */
export class TrackedDownload {
  downloadClient = 0;
  downloadItem!: DownloadClientItem;
  importItem: DownloadClientItem | null = null;
  state: TrackedDownloadState = TrackedDownloadState.Downloading;
  status: TrackedDownloadStatus = TrackedDownloadStatus.Ok;
  remoteBook: RemoteBook | null = null;
  statusMessages: TrackedDownloadStatusMessage[] = [];
  protocol!: DownloadProtocol;
  indexer: string | null = null;
  isTrackable = false;
}

/** Ported from `TrackedDownload.Warn(string message, params object[] args)`: formats a single message keyed by the download item's title. `args` are interpolated via a simple positional `{0}`/`{1}` replace, matching C#'s `string.Format`. */
export function warnTrackedDownloadFormatted(
  trackedDownload: TrackedDownload,
  message: string,
  ...args: unknown[]
): void {
  const formatted = args.reduce<string>(
    (acc, arg, i) => acc.replace(`{${i}}`, String(arg)),
    message
  );
  warnTrackedDownload(trackedDownload, [
    newTrackedDownloadStatusMessage(trackedDownload.downloadItem.title, formatted),
  ]);
}

/** Ported from `TrackedDownload.Warn(params TrackedDownloadStatusMessage[] statusMessages)`. */
export function warnTrackedDownload(
  trackedDownload: TrackedDownload,
  statusMessages: TrackedDownloadStatusMessage[]
): void {
  trackedDownload.status = TrackedDownloadStatus.Warning;
  trackedDownload.statusMessages = statusMessages;
}

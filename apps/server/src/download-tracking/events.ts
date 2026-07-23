import type { QualityModel } from "../qualities/qualityModel.js";
import type { ReleaseSourceType } from "../parser/model/releaseInfo.js";
import type { DownloadClientItemClientInfo } from "./downloadClients.js";
import type { TrackedDownload } from "./tracked-downloads/trackedDownload.js";

/** Ported from NzbDrone.Core/Download/DownloadCanBeRemovedEvent.cs. */
export class DownloadCanBeRemovedEvent {
  constructor(public readonly trackedDownload: TrackedDownload) {}
}

/** Ported from NzbDrone.Core/Download/DownloadCompletedEvent.cs. */
export class DownloadCompletedEvent {
  constructor(
    public readonly trackedDownload: TrackedDownload,
    public readonly authorId: number
  ) {}
}

/** Ported from NzbDrone.Core/Download/DownloadFailedEvent.cs. `data` defaults to an empty object, matching the C# ctor's `Data = new Dictionary<string, string>()`. */
export class DownloadFailedEvent {
  authorId = 0;
  bookIds: number[] = [];
  quality: QualityModel | null = null;
  sourceTitle = "";
  downloadClient: string | null = null;
  downloadId: string | null = null;
  message: string | null = null;
  data: Record<string, string> = {};
  trackedDownload: TrackedDownload | null = null;
  skipRedownload = false;
  releaseSource: ReleaseSourceType = 0;
}

/**
 * Ported from NzbDrone.Core/Download/DownloadIgnoredEvent.cs.
 * `downloadClientInfo` is `DownloadClientItemClientInfo | null` (the real
 * `download-clients/DownloadClientItem.ts`'s `downloadClientInfo` field --
 * this event's source, `trackedDownload.downloadItem.downloadClientInfo` --
 * is nullable there; C#'s `DownloadClientItemClientInfo DownloadClientInfo`
 * property carries the same value straight through with no non-null
 * guarantee either).
 */
export class DownloadIgnoredEvent {
  authorId = 0;
  bookIds: number[] = [];
  quality: QualityModel | null = null;
  sourceTitle = "";
  downloadClientInfo: DownloadClientItemClientInfo | null = null;
  downloadId: string | null = null;
  message: string | null = null;
  trackedDownload: TrackedDownload | null = null;
}

/** Ported from NzbDrone.Core/Download/DownloadsProcessedEvent.cs. */
export class DownloadsProcessedEvent {}

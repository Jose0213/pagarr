import { DownloadIgnoredEvent } from "./events.js";
import type { TrackedDownload } from "./tracked-downloads/trackedDownload.js";

/**
 * Ported from NzbDrone.Core/Download/IgnoredDownloadService.cs. No NLog
 * Logger -- per this port's established no-NLog-yet convention (the
 * `_logger.Warn` call on the failure path is omitted).
 */
export interface IIgnoredDownloadService {
  ignoreDownload(trackedDownload: TrackedDownload): boolean;
}

export interface DownloadIgnoredEventAggregatorLike {
  publishEvent(event: DownloadIgnoredEvent): void;
}

export class IgnoredDownloadService implements IIgnoredDownloadService {
  constructor(private readonly eventAggregator: DownloadIgnoredEventAggregatorLike) {}

  ignoreDownload(trackedDownload: TrackedDownload): boolean {
    const author = trackedDownload.remoteBook?.author;
    const books = trackedDownload.remoteBook?.books ?? [];

    if (!author || books.length === 0) {
      return false;
    }

    const downloadIgnoredEvent = new DownloadIgnoredEvent();
    downloadIgnoredEvent.authorId = author.id;
    downloadIgnoredEvent.bookIds = books.map((e) => e.id);
    downloadIgnoredEvent.quality = trackedDownload.remoteBook!.parsedBookInfo!.quality;
    downloadIgnoredEvent.sourceTitle = trackedDownload.downloadItem.title;
    downloadIgnoredEvent.downloadClientInfo = trackedDownload.downloadItem.downloadClientInfo;
    downloadIgnoredEvent.downloadId = trackedDownload.downloadItem.downloadId;
    downloadIgnoredEvent.trackedDownload = trackedDownload;
    downloadIgnoredEvent.message = "Manually ignored";

    this.eventAggregator.publishEvent(downloadIgnoredEvent);
    return true;
  }
}

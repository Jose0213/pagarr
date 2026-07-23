import type { IConfigService } from "../config/configService.js";
import { DownloadCanBeRemovedEvent, DownloadsProcessedEvent } from "./events.js";
import { TrackedDownloadState } from "./tracked-downloads/trackedDownload.js";
import type { ITrackedDownloadService } from "./tracked-downloads/trackedDownloadService.js";
import type { ICompletedDownloadService } from "./completedDownloadService.js";
import type { IFailedDownloadService } from "./failedDownloadService.js";

/**
 * Ported from NzbDrone.Core/Download/DownloadProcessingService.cs.
 *
 * `IExecute<ProcessMonitoredDownloadsCommand>` -- ported as a plain
 * `execute()` method, matching this port's "Messaging/Jobs not ported yet"
 * convention (see download-tracking/commands.ts's doc comment).
 *
 * No NLog Logger -- per this port's no-NLog-yet convention (the
 * per-download `catch (Exception e) { _logger.Debug(e, ...) }` still
 * catches and continues, just without logging).
 *
 * `execute()` is `async`/awaits `completedDownloadService.import` -- see
 * that class's doc comment for why it's now async (the real
 * `download-clients` `IDownloadClient.getImportItem` can require a network
 * round trip).
 */
export interface DownloadProcessingEventAggregatorLike {
  publishEvent(event: DownloadCanBeRemovedEvent | DownloadsProcessedEvent): void;
}

export class DownloadProcessingService {
  constructor(
    private readonly configService: IConfigService,
    private readonly completedDownloadService: ICompletedDownloadService,
    private readonly failedDownloadService: IFailedDownloadService,
    private readonly trackedDownloadService: ITrackedDownloadService,
    private readonly eventAggregator: DownloadProcessingEventAggregatorLike
  ) {}

  private removeCompletedDownloads(): void {
    const trackedDownloads = this.trackedDownloadService
      .getTrackedDownloads()
      .filter(
        (t) =>
          !t.downloadItem.removed &&
          t.downloadItem.canBeRemoved &&
          t.state === TrackedDownloadState.Imported
      );

    for (const trackedDownload of trackedDownloads) {
      this.eventAggregator.publishEvent(new DownloadCanBeRemovedEvent(trackedDownload));
    }
  }

  async execute(): Promise<void> {
    const enableCompletedDownloadHandling = this.configService.enableCompletedDownloadHandling;
    const trackedDownloads = this.trackedDownloadService
      .getTrackedDownloads()
      .filter((t) => t.isTrackable);

    for (const trackedDownload of trackedDownloads) {
      try {
        if (trackedDownload.state === TrackedDownloadState.DownloadFailedPending) {
          this.failedDownloadService.processFailed(trackedDownload);
        } else if (
          enableCompletedDownloadHandling &&
          trackedDownload.state === TrackedDownloadState.ImportPending
        ) {
          await this.completedDownloadService.import(trackedDownload);
        }
      } catch {
        // See class doc comment: catch-and-continue, log omitted.
      }
    }

    // Imported downloads are no longer trackable, so process them after
    // processing trackable downloads.
    this.removeCompletedDownloads();

    this.eventAggregator.publishEvent(new DownloadsProcessedEvent());
  }
}

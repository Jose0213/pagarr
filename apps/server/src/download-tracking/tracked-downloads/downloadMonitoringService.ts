import type { IConfigService } from "../../config/configService.js";
import {
  DownloadItemStatus,
  type IDownloadClient,
  type IDownloadClientFactory,
  type IDownloadClientStatusService,
} from "../downloadClients.js";
import { TrackedDownloadRefreshedEvent } from "./trackedDownloadRefreshedEvent.js";
import { TrackedDownloadsRemovedEvent } from "./trackedDownloadsRemovedEvent.js";
import { DownloadsProcessedEvent } from "../events.js";
import { Debouncer } from "./debouncer.js";
import { TrackedDownloadState, type TrackedDownload } from "./trackedDownload.js";
import type { ITrackedDownloadService } from "./trackedDownloadService.js";

/** Narrow surface `DownloadMonitoringService` needs from `ICompletedDownloadService` (defined for real in `download-tracking/completedDownloadService.ts`; `check` is `async` there now -- see that file's doc comment). */
export interface CompletedDownloadCheckerLike {
  check(trackedDownload: TrackedDownload): Promise<void>;
}

/** Narrow surface `DownloadMonitoringService` needs from `IFailedDownloadService` (defined for real in `download-tracking/failedDownloadService.ts`). */
export interface FailedDownloadCheckerLike {
  check(trackedDownload: TrackedDownload): void;
}

/** Stand-in for `IManageCommandQueue.Push` -- see this module's overall doc comment (Messaging/Jobs, Phase 4, not ported) and root-folders/root-folder-service.ts's identical pattern. */
export type CommandPusher = (
  commandName: "RefreshMonitoredDownloads" | "ProcessMonitoredDownloads"
) => void;

export interface DownloadMonitoringEventAggregatorLike {
  publishEvent(
    event: TrackedDownloadRefreshedEvent | TrackedDownloadsRemovedEvent | DownloadsProcessedEvent
  ): void;
}

/**
 * Ported from NzbDrone.Core/Download/TrackedDownloads/DownloadMonitoringService.cs.
 *
 * DEVIATIONS:
 *  - `IManageCommandQueue.Push(new RefreshMonitoredDownloadsCommand(),
 *    CommandPriority.High)` / `Push(new ProcessMonitoredDownloadsCommand(),
 *    ...)` become a single injected `pushCommand` callback (see
 *    `CommandPusher` above) -- same "Messaging/Jobs not ported yet, use a
 *    callback seam" pattern as root-folders/root-folder-service.ts.
 *  - No NLog Logger -- `_logger.Warn`/`_logger.Error` calls omitted per this
 *    port's established no-NLog-yet convention (see
 *    config/configService.ts's doc comment).
 *  - `IExecute<RefreshMonitoredDownloadsCommand>`/`IExecute<
 *    CheckForFinishedDownloadCommand>` (Messaging.Commands' command-executor
 *    interface) become plain `execute*` methods; a real command dispatcher
 *    can call them once Messaging/Jobs lands.
 *  - `refresh()`/`processClientDownloads()`/`processClientItem()` are now
 *    `async`/await the real `download-clients` `IDownloadClient.getItems()`/
 *    `completedDownloadService.check()` (both `Promise<T> | T` on the real
 *    port -- see IDownloadClient.ts's doc comment and completedDownloadService.ts's
 *    class doc comment) where C#'s `IDownloadClient.GetItems()`/
 *    `ICompletedDownloadService.Check()` are synchronous.
 *    `executeRefreshMonitoredDownloads`/`executeCheckForFinishedDownload`/
 *    `handleBookGrabbed`/`handleTrackImported` are async in step.
 */
export class DownloadMonitoringService {
  private readonly refreshDebounce: Debouncer;

  constructor(
    private readonly downloadClientStatusService: IDownloadClientStatusService,
    private readonly downloadClientFactory: IDownloadClientFactory,
    private readonly eventAggregator: DownloadMonitoringEventAggregatorLike,
    private readonly pushCommand: CommandPusher,
    private readonly configService: IConfigService,
    private readonly failedDownloadService: FailedDownloadCheckerLike,
    private readonly completedDownloadService: CompletedDownloadCheckerLike,
    private readonly trackedDownloadService: ITrackedDownloadService,
    debounceDurationMs = 5000
  ) {
    this.refreshDebounce = new Debouncer(() => this.queueRefresh(), debounceDurationMs);
  }

  private queueRefresh(): void {
    this.pushCommand("RefreshMonitoredDownloads");
  }

  private async refresh(): Promise<void> {
    this.refreshDebounce.pause();
    try {
      const downloadClients = this.downloadClientFactory.downloadHandlingEnabled();

      const trackedDownloads: TrackedDownload[] = [];

      for (const downloadClient of downloadClients) {
        const clientTrackedDownloads = await this.processClientDownloads(downloadClient);
        trackedDownloads.push(...clientTrackedDownloads.filter((t) => this.downloadIsTrackable(t)));
      }

      this.trackedDownloadService.updateTrackable(trackedDownloads);
      this.eventAggregator.publishEvent(new TrackedDownloadRefreshedEvent(trackedDownloads));
      this.pushCommand("ProcessMonitoredDownloads");
    } finally {
      this.refreshDebounce.resume();
    }
  }

  private async processClientDownloads(
    downloadClient: IDownloadClient
  ): Promise<TrackedDownload[]> {
    let downloadClientItems: Awaited<ReturnType<IDownloadClient["getItems"]>> = [];
    const trackedDownloads: TrackedDownload[] = [];

    try {
      downloadClientItems = await downloadClient.getItems();
      this.downloadClientStatusService.recordSuccess(downloadClient.definition.id);
    } catch {
      this.downloadClientStatusService.recordFailure(downloadClient.definition.id);
    }

    for (const downloadItem of downloadClientItems) {
      const item = await this.processClientItem(downloadClient, downloadItem);
      if (item !== null) {
        trackedDownloads.push(item);
      }
    }

    return trackedDownloads;
  }

  private async processClientItem(
    downloadClient: IDownloadClient,
    downloadItem: Parameters<ITrackedDownloadService["trackDownload"]>[1]
  ): Promise<TrackedDownload | null> {
    try {
      const trackedDownload = this.trackedDownloadService.trackDownload(
        downloadClient.definition,
        downloadItem
      );

      if (trackedDownload !== null && trackedDownload.state === TrackedDownloadState.Downloading) {
        this.failedDownloadService.check(trackedDownload);
        await this.completedDownloadService.check(trackedDownload);
      }

      return trackedDownload;
    } catch {
      return null;
    }
  }

  private downloadIsTrackable(trackedDownload: TrackedDownload): boolean {
    // If the download has already been imported or failed or the user
    // ignored it, don't track it.
    if (
      trackedDownload.state === TrackedDownloadState.Imported ||
      trackedDownload.state === TrackedDownloadState.DownloadFailed ||
      trackedDownload.state === TrackedDownloadState.Ignored
    ) {
      return false;
    }

    // If CDH is disabled and the download status is complete, don't track it.
    if (
      !this.configService.enableCompletedDownloadHandling &&
      trackedDownload.downloadItem.status === DownloadItemStatus.Completed
    ) {
      return false;
    }

    return true;
  }

  async executeRefreshMonitoredDownloads(): Promise<void> {
    await this.refresh();
  }

  /** Ported from `Execute(CheckForFinishedDownloadCommand message)`: deprecated, redirects to `Refresh()` (C# also logs a deprecation warning here -- omitted per no-NLog-yet convention). */
  async executeCheckForFinishedDownload(): Promise<void> {
    await this.refresh();
  }

  handleBookGrabbed(): void {
    this.refreshDebounce.execute();
  }

  handleTrackImported(): void {
    this.refreshDebounce.execute();
  }

  handleDownloadsProcessed(): void {
    const trackedDownloads = this.trackedDownloadService
      .getTrackedDownloads()
      .filter((t) => t.isTrackable && this.downloadIsTrackable(t));

    this.eventAggregator.publishEvent(new TrackedDownloadRefreshedEvent(trackedDownloads));
  }

  handleTrackedDownloadsRemoved(): void {
    const trackedDownloads = this.trackedDownloadService
      .getTrackedDownloads()
      .filter((t) => t.isTrackable && this.downloadIsTrackable(t));

    this.eventAggregator.publishEvent(new TrackedDownloadRefreshedEvent(trackedDownloads));
  }
}

import {
  DownloadItemStatus,
  type IDownloadClient,
  type IProvideDownloadClient,
} from "./downloadClients.js";
import type {
  DownloadCanBeRemovedEvent,
  DownloadCompletedEvent,
  DownloadFailedEvent,
} from "./events.js";
import type { TrackedDownload } from "./tracked-downloads/trackedDownload.js";

/**
 * Ported from NzbDrone.Core/Download/DownloadEventHub.cs.
 *
 * `IConfigService` is injected per the real C# constructor even though no
 * method body reads it (checked: `DownloadEventHub.cs` never calls
 * `_configService` anywhere) -- kept as an unused constructor parameter for
 * 1:1 shape fidelity, matching this port's precedent for genuinely-unused
 * injected dependencies (see `remotePathMappingService.ts`'s doc comment on
 * `IDownloadClientRepository`).
 *
 * No NLog Logger -- per this port's no-NLog-yet convention.
 *
 * `removeFromDownloadClient`/`markItemAsImported` (and everything that calls
 * them) are now `async`/await the real `download-clients` `IDownloadClient.
 * removeItem`/`markItemAsImported` -- `Promise<void> | void` on the real
 * port (wider than C#'s synchronous `RemoveItem`/`MarkItemAsImported`, see
 * IDownloadClient.ts's doc comment: QBittorrent's `MarkItemAsImported`
 * override calls `SetTorrentLabel`, a network round trip). `await`ing
 * inside the existing `try`/`catch` is required for the catch block to
 * actually observe a rejected promise, not just a synchronous throw.
 */
export interface IEventHandlerLike {
  handleDownloadFailed(message: DownloadFailedEvent): Promise<void>;
  handleDownloadCompleted(message: DownloadCompletedEvent): Promise<void>;
  handleDownloadCanBeRemoved(message: DownloadCanBeRemovedEvent): Promise<void>;
}

export class DownloadEventHub implements IEventHandlerLike {
  constructor(
    configService: unknown,
    private readonly downloadClientProvider: IProvideDownloadClient
  ) {
    void configService;
  }

  async handleDownloadFailed(message: DownloadFailedEvent): Promise<void> {
    const trackedDownload = message.trackedDownload;

    if (
      trackedDownload === null ||
      trackedDownload.downloadItem.removed ||
      !trackedDownload.downloadItem.canBeRemoved
    ) {
      return;
    }

    const downloadClient = this.downloadClientProvider.get(trackedDownload.downloadClient);
    const definition = downloadClient.definition;

    if (!definition.removeFailedDownloads) {
      return;
    }

    await this.removeFromDownloadClient(trackedDownload, downloadClient);
  }

  async handleDownloadCompleted(message: DownloadCompletedEvent): Promise<void> {
    const trackedDownload = message.trackedDownload;
    const downloadClient = this.downloadClientProvider.get(trackedDownload.downloadClient);
    const definition = downloadClient.definition;

    await this.markItemAsImported(trackedDownload, downloadClient);

    if (
      trackedDownload.downloadItem.removed ||
      !trackedDownload.downloadItem.canBeRemoved ||
      trackedDownload.downloadItem.status === DownloadItemStatus.Downloading
    ) {
      return;
    }

    if (!definition.removeCompletedDownloads) {
      return;
    }

    await this.removeFromDownloadClient(trackedDownload, downloadClient);
  }

  async handleDownloadCanBeRemoved(message: DownloadCanBeRemovedEvent): Promise<void> {
    const trackedDownload = message.trackedDownload;
    const downloadClient = this.downloadClientProvider.get(trackedDownload.downloadClient);
    const definition = downloadClient.definition;

    if (
      trackedDownload.downloadItem.removed ||
      !trackedDownload.downloadItem.canBeRemoved ||
      !definition.removeCompletedDownloads
    ) {
      return;
    }

    await this.removeFromDownloadClient(trackedDownload, downloadClient);
  }

  private async removeFromDownloadClient(
    trackedDownload: TrackedDownload,
    downloadClient: IDownloadClient
  ): Promise<void> {
    try {
      await downloadClient.removeItem(trackedDownload.downloadItem, true);
      trackedDownload.downloadItem.removed = true;
    } catch {
      // C#: catches NotSupportedException (logs a warning, "not supported
      // by your download client") vs any other Exception (logs an error) --
      // both branches are log-only in the real source; omitted per this
      // port's no-NLog-yet convention. The removal simply doesn't happen on
      // failure, matching the observable (non-logging) behavior either way.
    }
  }

  private async markItemAsImported(
    trackedDownload: TrackedDownload,
    downloadClient: IDownloadClient
  ): Promise<void> {
    try {
      await downloadClient.markItemAsImported(trackedDownload.downloadItem);
    } catch {
      // See removeFromDownloadClient's doc comment -- log-only in C#, omitted here.
    }
  }
}

import type { AuthorDeletedEvent } from "../../books/events.js";
import type { ReleaseInfo } from "../../parser/model/releaseInfo.js";
import type { BookGrabbedEvent } from "../bookGrabbedEvent.js";
import type {
  DownloadCompletedEvent,
  DownloadFailedEvent,
  DownloadIgnoredEvent,
} from "../events.js";
import type { TrackImportedEvent } from "../mediaFilesEvents.js";
import type { BookImportIncompleteEvent } from "../bookImportIncompleteEvent.js";
import type { HistoryServiceLike } from "../entityHistory.js";
import {
  DownloadHistoryEventType,
  newDownloadHistory,
  type DownloadHistory,
} from "./downloadHistory.js";
import type { IDownloadHistoryRepository } from "./downloadHistoryRepository.js";

/**
 * Adapts DecisionEngine's forward-ref `ReleaseInfo` (`BookGrabbedEvent.book.release`
 * -- see bookGrabbedEvent.ts's doc comment on why that event carries
 * DecisionEngine's `RemoteBook`, not Parser's) to Parser's real, ported
 * `ReleaseInfo` (`DownloadHistory.release`'s type) -- same gap/approach as
 * `pending/pendingReleaseService.ts`'s `releaseInfoFromDecision`, documented
 * there in full; duplicated locally here rather than shared across the two
 * subdirectories to keep each sub-module's internals self-contained,
 * matching this port's existing per-directory style.
 */
function releaseInfoFromDecision(
  release: import("../../decision-engine/remoteBook.js").ReleaseInfo
): ReleaseInfo {
  return {
    guid: release.guid,
    title: release.title,
    size: release.size,
    downloadUrl: release.downloadUrl,
    infoUrl: release.infoUrl ?? null,
    commentUrl: release.commentUrl ?? null,
    indexerId: release.indexerId,
    indexer: release.indexer,
    author: release.author ?? null,
    book: release.book ?? null,
    indexerPriority: release.indexerPriority,
    // Parser's real ReleaseInfo.downloadProtocol is a `string | null`
    // placeholder -- see pending/pendingReleaseService.ts's
    // `parseDownloadProtocolString` doc comment for the full explanation.
    downloadProtocol: String(release.downloadProtocol),
    publishDate: release.publishDate,
    origin: release.origin ?? null,
    source: release.source ?? null,
    container: release.container ?? null,
    codec: release.codec ?? null,
    categories: release.categories ?? null,
    languages: [],
    indexerFlags: 0 as import("../../parser/model/releaseInfo.js").IndexerFlags,
    pendingReleaseReason: null,
  };
}

/**
 * Ported from NzbDrone.Core/Download/History/DownloadHistoryService.cs.
 *
 * `IHandle<T>` event subscriptions are ported as individually-named
 * `handleXxx` methods (matching this port's established convention -- see
 * e.g. tracked-downloads/trackedDownloadService.ts's `handleBookInfoRefreshed`/
 * `handleAuthorDeleted`) rather than a single overloaded `Handle`, since TS
 * has no method-overload-by-parameter-type dispatch the way C# interfaces
 * do; a caller (Messaging, once ported) wires each event type to its
 * matching handler method explicitly.
 */
export interface IDownloadHistoryService {
  downloadAlreadyImported(downloadId: string): boolean;
  getLatestDownloadHistoryItem(downloadId: string): DownloadHistory | undefined;
  getLatestGrab(downloadId: string): DownloadHistory | undefined;
}

export class DownloadHistoryService implements IDownloadHistoryService {
  constructor(
    private readonly repository: IDownloadHistoryRepository,
    private readonly historyService: HistoryServiceLike
  ) {}

  /**
   * Ported from `DownloadAlreadyImported`: events are ordered by date
   * descending -- if a Grabbed event comes before an Imported event, it was
   * never imported (or was grabbed again after importing), and should be
   * reprocessed.
   */
  downloadAlreadyImported(downloadId: string): boolean {
    const events = this.repository.findByDownloadId(downloadId);

    for (const e of events) {
      if (e.eventType === DownloadHistoryEventType.DownloadGrabbed) {
        return false;
      }
      if (e.eventType === DownloadHistoryEventType.DownloadImported) {
        return true;
      }
    }

    return false;
  }

  /** Ported from `GetLatestDownloadHistoryItem`: events ordered by date descending, returns the most recent "expected" event type. */
  getLatestDownloadHistoryItem(downloadId: string): DownloadHistory | undefined {
    const events = this.repository.findByDownloadId(downloadId);

    for (const e of events) {
      if (
        e.eventType === DownloadHistoryEventType.DownloadIgnored ||
        e.eventType === DownloadHistoryEventType.DownloadGrabbed ||
        e.eventType === DownloadHistoryEventType.DownloadImported ||
        e.eventType === DownloadHistoryEventType.DownloadFailed ||
        e.eventType === DownloadHistoryEventType.DownloadImportIncomplete
      ) {
        return e;
      }
    }

    return undefined;
  }

  /** Ported from `GetLatestGrab`. */
  getLatestGrab(downloadId: string): DownloadHistory | undefined {
    return this.repository
      .findByDownloadId(downloadId)
      .find((d) => d.eventType === DownloadHistoryEventType.DownloadGrabbed);
  }

  /** Ported from `Handle(BookGrabbedEvent message)`. */
  handleBookGrabbed(message: BookGrabbedEvent): void {
    if (!message.downloadId || message.downloadId.trim() === "") {
      return;
    }

    const history: DownloadHistory = newDownloadHistory({
      eventType: DownloadHistoryEventType.DownloadGrabbed,
      authorId: message.book.author.id,
      downloadId: message.downloadId,
      sourceTitle: message.book.release.title ?? "",
      date: new Date().toISOString(),
      protocol: message.book.release.downloadProtocol,
      indexerId: message.book.release.indexerId,
      downloadClientId: message.downloadClientId,
      release: releaseInfoFromDecision(message.book.release),
      data: {
        Indexer: message.book.release.indexer ?? "",
        DownloadClient: message.downloadClient ?? "",
        DownloadClientName: message.downloadClientName ?? "",
        CustomFormatScore: String(message.book.customFormatScore),
      },
    });

    this.repository.insert(history);
  }

  /** Ported from `Handle(TrackImportedEvent message)`. `findDownloadId` stands in for `_historyService.FindDownloadId(message)` (History module, not ported -- see entityHistory.ts's doc comment); defaults to "can't recover a download id" (null) when omitted. */
  handleTrackImported(
    message: TrackImportedEvent,
    findDownloadId: (message: TrackImportedEvent) => string | null = () => null
  ): void {
    if (!message.newDownload) {
      return;
    }

    let downloadId = message.downloadId;

    // Try to find the downloadId if the user used manual import (from
    // wanted: missing) or the API to import and downloadId wasn't provided.
    if (!downloadId || downloadId.trim() === "") {
      downloadId = findDownloadId(message);
    }

    if (!downloadId || downloadId.trim() === "") {
      return;
    }

    const history: DownloadHistory = newDownloadHistory({
      eventType: DownloadHistoryEventType.FileImported,
      authorId: message.importedBook.author.id,
      downloadId,
      sourceTitle: message.bookInfo.path,
      date: new Date().toISOString(),
      protocol: message.downloadClientInfo?.protocol ?? null,
      downloadClientId: message.downloadClientInfo?.id ?? null,
      data: {
        DownloadClient: message.downloadClientInfo?.type ?? "",
        DownloadClientName: message.downloadClientInfo?.name ?? "",
        SourcePath: message.bookInfo.path,
        DestinationPath: message.importedBook.path,
      },
    });

    this.repository.insert(history);
  }

  /** Ported from `Handle(BookImportIncompleteEvent message)`. */
  handleBookImportIncomplete(message: BookImportIncompleteEvent): void {
    const history: DownloadHistory = newDownloadHistory({
      eventType: DownloadHistoryEventType.DownloadImportIncomplete,
      authorId: message.trackedDownload.remoteBook?.author?.id ?? 0,
      downloadId: message.trackedDownload.downloadItem.downloadId,
      sourceTitle: message.trackedDownload.downloadItem.outputPath.fullPath,
      date: new Date().toISOString(),
      protocol: message.trackedDownload.protocol,
      downloadClientId: message.trackedDownload.downloadClient,
      data: {
        DownloadClient: message.trackedDownload.downloadItem.downloadClientInfo?.type ?? "",
        DownloadClientName: message.trackedDownload.downloadItem.downloadClientInfo?.name ?? "",
        StatusMessages: JSON.stringify(message.trackedDownload.statusMessages),
      },
    });

    this.repository.insert(history);
  }

  /** Ported from `Handle(DownloadCompletedEvent message)`. */
  handleDownloadCompleted(message: DownloadCompletedEvent): void {
    const downloadItem = message.trackedDownload.downloadItem;

    const history: DownloadHistory = newDownloadHistory({
      eventType: DownloadHistoryEventType.DownloadImported,
      authorId: message.authorId,
      downloadId: downloadItem.downloadId,
      sourceTitle: downloadItem.title,
      date: new Date().toISOString(),
      protocol: message.trackedDownload.protocol,
      downloadClientId: message.trackedDownload.downloadClient,
      data: {
        DownloadClient: downloadItem.downloadClientInfo?.type ?? "",
        DownloadClientName: downloadItem.downloadClientInfo?.name ?? "",
      },
    });

    this.repository.insert(history);
  }

  /** Ported from `Handle(DownloadFailedEvent message)`. */
  handleDownloadFailed(message: DownloadFailedEvent): void {
    // Don't track failed download for an unknown download
    if (message.trackedDownload === null) {
      return;
    }

    const history: DownloadHistory = newDownloadHistory({
      eventType: DownloadHistoryEventType.DownloadFailed,
      authorId: message.authorId,
      downloadId: message.downloadId ?? "",
      sourceTitle: message.sourceTitle,
      date: new Date().toISOString(),
      protocol: message.trackedDownload.protocol,
      downloadClientId: message.trackedDownload.downloadClient,
      data: {
        DownloadClient: message.trackedDownload.downloadItem.downloadClientInfo?.type ?? "",
        DownloadClientName: message.trackedDownload.downloadItem.downloadClientInfo?.name ?? "",
      },
    });

    this.repository.insert(history);
  }

  /** Ported from `Handle(DownloadIgnoredEvent message)`. */
  handleDownloadIgnored(message: DownloadIgnoredEvent): void {
    const history: DownloadHistory = newDownloadHistory({
      eventType: DownloadHistoryEventType.DownloadIgnored,
      authorId: message.authorId,
      downloadId: message.downloadId ?? "",
      sourceTitle: message.sourceTitle,
      date: new Date().toISOString(),
      protocol: message.downloadClientInfo?.protocol ?? null,
      downloadClientId: message.downloadClientInfo?.id ?? null,
      data: {
        DownloadClient: message.downloadClientInfo?.type ?? "",
        DownloadClientName: message.downloadClientInfo?.name ?? "",
      },
    });

    this.repository.insert(history);
  }

  /** Ported from `Handle(AuthorDeletedEvent message)`. */
  handleAuthorDeleted(message: AuthorDeletedEvent): void {
    this.repository.deleteByAuthorId(message.author.id);
  }
}

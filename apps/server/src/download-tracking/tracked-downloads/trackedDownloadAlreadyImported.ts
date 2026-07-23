import { EntityHistoryEventType, type EntityHistoryRecord } from "../entityHistory.js";
import type { TrackedDownload } from "./trackedDownload.js";

/**
 * Ported from NzbDrone.Core/Download/TrackedDownloads/TrackedDownloadAlreadyImported.cs.
 *
 * Logger calls (`_logger.Trace`) are omitted per this port's established
 * "no NLog port yet" convention (see config/configService.ts's doc comment)
 * -- nothing here needs logging to behave correctly.
 */
export interface ITrackedDownloadAlreadyImported {
  isImported(trackedDownload: TrackedDownload, historyItems: EntityHistoryRecord[]): boolean;
}

export class TrackedDownloadAlreadyImported implements ITrackedDownloadAlreadyImported {
  isImported(trackedDownload: TrackedDownload, historyItems: EntityHistoryRecord[]): boolean {
    if (historyItems.length === 0) {
      return false;
    }

    if (trackedDownload.remoteBook === null || trackedDownload.remoteBook.books === null) {
      return true;
    }

    return trackedDownload.remoteBook.books.every((book) => {
      const lastHistoryItem = historyItems.find((h) => h.bookId === book.id);

      if (!lastHistoryItem) {
        return false;
      }

      return lastHistoryItem.eventType === EntityHistoryEventType.BookFileImported;
    });
  }
}

import type { QualityModel } from "../qualities/qualityModel.js";

/**
 * Forward-refs for the `History` module (Phase 4, not ported yet) --
 * see remoteBook.ts's header comment for the general approach.
 */

/** Ported from NzbDrone.Core/History/EntityHistory.cs's `EntityHistoryEventType` enum. */
export enum EntityHistoryEventType {
  Unknown = 0,
  Grabbed = 1,
  BookFileImported = 3,
  DownloadFailed = 4,
  BookFileDeleted = 5,
  BookFileRenamed = 6,
  BookImportIncomplete = 7,
  DownloadImported = 8,
  BookFileRetagged = 9,
  DownloadIgnored = 10,
}

/** Forward-ref for the slice of NzbDrone.Core/History/EntityHistory.cs DecisionEngine reads. */
export interface EntityHistoryRecord {
  id: number;
  bookId: number;
  authorId: number;
  sourceTitle: string;
  quality: QualityModel;
  /** ISO 8601 string, matches this repo's date convention elsewhere. */
  date: string;
  eventType: EntityHistoryEventType;
  downloadId: string | null;
}

/** Forward-ref for the slice of NzbDrone.Core/History/IHistoryService.cs DecisionEngine calls. */
export interface HistoryServiceLike {
  mostRecentForBook(bookId: number): EntityHistoryRecord | null;
  getByBook(bookId: number, eventType: EntityHistoryEventType | null): EntityHistoryRecord[];
}

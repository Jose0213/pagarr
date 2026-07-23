import type { QualityModel } from "../qualities/qualityModel.js";

/**
 * Forward-references for the `NzbDrone.Core.History` module (the *generic*
 * grab/import/failure event log -- distinct from this module's own
 * `Download.History` sub-namespace, which IS real and ported at
 * `download-tracking/history/`). `History` is Phase 4 (see PORT_PLAN.md),
 * not in this worktree's scope, and not merged yet -- these are minimal
 * local stand-ins for the exact shapes this module's real C# source
 * (`FailedDownloadService.cs`, `CompletedDownloadService.cs`,
 * `TrackedDownloadService.cs`, `TrackedDownloadAlreadyImported.cs`) actually
 * reads/writes, copied field-for-field from
 * `NzbDrone.Core/History/EntityHistory.cs` /
 * `NzbDrone.Core/History/IHistoryService.cs`. When `History` lands, these
 * should be deleted in favor of importing the real types (same pattern as
 * `decision-engine/remoteBook.ts`'s header comment; note
 * `decision-engine/history.ts` already forward-refs a narrower slice of the
 * same C# module for DecisionEngine's own needs -- the two forward-ref sets
 * are independent copies since neither module owns History).
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

/** Ported from EntityHistory.cs's `Data` dictionary well-known keys. */
export const ENTITY_HISTORY_DOWNLOAD_CLIENT = "downloadClient";
export const ENTITY_HISTORY_RELEASE_SOURCE = "releaseSource";
export const ENTITY_HISTORY_RELEASE_GROUP = "releaseGroup";
export const ENTITY_HISTORY_SIZE = "size";
export const ENTITY_HISTORY_INDEXER = "indexer";

/** Forward-ref for NzbDrone.Core/History/EntityHistory.cs. */
export interface EntityHistoryRecord {
  id: number;
  bookId: number;
  authorId: number;
  sourceTitle: string;
  quality: QualityModel;
  /** ISO 8601 string, matches this repo's date convention elsewhere. */
  date: string;
  eventType: EntityHistoryEventType;
  data: Record<string, string | undefined>;
  downloadId: string | null;
}

/** Forward-ref for the slice of NzbDrone.Core/History/IHistoryService.cs this module's real C# source calls. */
export interface HistoryServiceLike {
  mostRecentForDownloadId(downloadId: string): EntityHistoryRecord | null;
  get(historyId: number): EntityHistoryRecord;
  find(downloadId: string, eventType: EntityHistoryEventType): EntityHistoryRecord[];
  findByDownloadId(downloadId: string): EntityHistoryRecord[];
}

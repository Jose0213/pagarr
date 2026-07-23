import type { ModelBase } from "../db/model-base.js";
import type { Author, Book } from "../books/models.js";
import type { QualityModel } from "../qualities/qualityModel.js";

/**
 * Ported from NzbDrone.Core/History/EntityHistory.cs. Backing table: History
 * (migration 0001; see db/migrations/0001_initial_setup.sql).
 *
 * `Author`/`Book` are C#'s dynamically-queried navigation properties here
 * ported as plain optional fields per this port's established LazyLoaded
 * convention (see `books/models.ts`'s header comment) -- populated by
 * repository methods that join (`findByDownloadId`/`getByBook`/`since`),
 * left unpopulated by the plain CRUD methods, matching the real C#
 * repository's actual per-method behavior (see `historyRepository.ts`'s
 * doc comment).
 *
 * NOTE for the reconciliation pass (see this module's final report): this
 * is the SAME real C# type that `download-tracking/entityHistory.ts` (a
 * Phase-3 forward-ref) and `decision-engine/history.ts` (a narrower
 * Phase-2 forward-ref) both independently stood in for -- both those files'
 * `EntityHistoryEventType`/`EntityHistoryRecord`/`HistoryServiceLike`
 * declarations should be deleted in favor of importing this module's real
 * `EntityHistory`/`EntityHistoryEventType`/`IHistoryService` once merged.
 */
export interface EntityHistory extends ModelBase {
  bookId: number;
  authorId: number;
  sourceTitle: string;
  quality: QualityModel;
  /** ISO-8601 timestamp string (C# `DateTime`). */
  date: string;
  book?: Book;
  author?: Author;
  eventType: EntityHistoryEventType;
  data: Record<string, string | undefined>;
  downloadId: string | null;
}

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

/** Ported from `EntityHistory`'s parameterless constructor (`Data = new Dictionary<string, string>()`) plus the rest of its implicit default field values. */
export function newEntityHistory(overrides: Partial<EntityHistory> = {}): EntityHistory {
  return {
    id: 0,
    bookId: 0,
    authorId: 0,
    sourceTitle: "",
    quality: undefined as unknown as QualityModel,
    date: new Date(0).toISOString(),
    eventType: EntityHistoryEventType.Unknown,
    data: {},
    downloadId: null,
    ...overrides,
  };
}

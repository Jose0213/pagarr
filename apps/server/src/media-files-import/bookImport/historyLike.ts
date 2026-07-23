/**
 * Forward-reference for `NzbDrone.Core/History/IHistoryService.cs` and
 * `EntityHistory.cs` -- the `History` module is out of scope for this
 * worktree (not listed in SCOPE). Shared by
 * `specifications/alreadyImportedSpecification.ts` (`GetByBook`) and
 * `importApprovedBooks.ts` (`FindByDownloadId`) since both real C# call
 * sites read off the same `EntityHistory`/`IHistoryService` types.
 */

/** Ported from `NzbDrone.Core/History/EntityHistory.cs`'s `EntityHistoryEventType` enum, narrowed to members this module's code reads. */
export enum EntityHistoryEventTypeLike {
  Grabbed = "Grabbed",
  BookFileImported = "BookFileImported",
}

/** Ported from the slice of `NzbDrone.Core/History/EntityHistory.cs` this module reads. */
export interface EntityHistoryLike {
  eventType: EntityHistoryEventTypeLike;
  downloadId: string | null;
  /** ISO-8601 timestamp string (C# `DateTime`). */
  date: string;
  /** `EntityHistory.Data` -- a `Dictionary<string, string>` in C#; only `indexerFlags` is read by this module's code (`ImportApprovedBooks`). */
  data?: Record<string, string | undefined>;
}

/** Ported from the slice of `NzbDrone.Core/History/IHistoryService.cs` this module calls. */
export interface HistoryLookup {
  getByBook(bookId: number, eventType: EntityHistoryEventTypeLike | null): EntityHistoryLike[];
  findByDownloadId(downloadId: string): EntityHistoryLike[];
}

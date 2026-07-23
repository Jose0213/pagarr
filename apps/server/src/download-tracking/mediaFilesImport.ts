import type { Author, Book } from "../books/models.js";
import type { DownloadClientItem } from "./downloadClients.js";

/**
 * Forward-references for the slice of `NzbDrone.Core.MediaFiles`/
 * `NzbDrone.Core.MediaFiles.BookImport` `CompletedDownloadService.cs` (this
 * module's real C# source) reads. `MediaFiles`/`BookImport` (the actual
 * file-on-disk import pipeline) is a later phase (see PORT_PLAN.md), not in
 * this worktree's scope -- copied field-for-field from the real C# classes
 * referenced in each doc comment, same pattern as `downloadClients.ts`/
 * `entityHistory.ts`/`mediaFilesEvents.ts` in this module.
 */

/** Ported from NzbDrone.Core/MediaFiles/BookImport/ImportMode.cs. */
export enum ImportMode {
  Auto = 0,
  Move = 1,
  Copy = 2,
}

/** Ported from NzbDrone.Core/MediaFiles/BookImport/ImportResultType.cs. */
export enum ImportResultType {
  Imported = "Imported",
  Rejected = "Rejected",
  Skipped = "Skipped",
}

/** Forward-ref for the slice of NzbDrone.Core/Parser/Model/LocalBook.cs `ImportResult.ImportDecision.Item` exposes to `CompletedDownloadService`. */
export interface ImportLocalBookLike {
  path: string;
  book: Book;
  author: Author;
}

/** Forward-ref for the slice of NzbDrone.Core/MediaFiles/BookImport/ImportDecision.cs `CompletedDownloadService` reads. */
export interface ImportDecisionLike {
  item: ImportLocalBookLike;
  approved: boolean;
}

/**
 * Forward-ref for NzbDrone.Core/MediaFiles/BookImport/ImportResult.cs.
 * `result` is ported as a plain field (not a computed getter) -- the
 * producer (the not-yet-ported import pipeline) is responsible for setting
 * it consistently with `errors`/`importDecision.approved`, matching how
 * this port's other forward-refs represent C# computed properties it
 * doesn't own the derivation logic for.
 */
export interface ImportResult {
  importDecision: ImportDecisionLike;
  errors: string[];
  result: ImportResultType;
}

/** Forward-ref for the slice of NzbDrone.Core/MediaFiles/DownloadedBooksImportService.cs's `IDownloadedBooksImportService` this module calls. */
export interface IDownloadedBooksImportService {
  processPath(
    path: string,
    importMode: ImportMode,
    author: Author | null,
    downloadClientItem: DownloadClientItem | null
  ): ImportResult[];
}

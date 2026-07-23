import type { Author, Book } from "../books/models.js";
import type { QualityModel } from "../qualities/qualityModel.js";
import type { DownloadClientItem, DownloadClientItemClientInfo } from "./downloadClients.js";
import type { IndexerFlags } from "../parser/model/releaseInfo.js";

/**
 * Forward-references for the slice of `NzbDrone.Core.MediaFiles`/
 * `NzbDrone.Core.MediaFiles.Events` this module's real C# source
 * (`DownloadHistoryService.cs`, `TrackedDownloadService.cs`,
 * `CompletedDownloadService.cs`) reads. `MediaFiles` (the actual
 * file-on-disk import pipeline) is a later phase (see PORT_PLAN.md), not in
 * this worktree's scope -- these are minimal local stand-ins copied
 * field-for-field from the real C# classes referenced in each doc comment,
 * same pattern as `downloadClients.ts`/`entityHistory.ts` in this module.
 */

/** Forward-ref for the slice of NzbDrone.Core/MediaFiles/BookFile.cs `TrackImportedEvent.ImportedBook` exposes to this module's call sites. */
export interface BookFileLike {
  id: number;
  path: string;
  /** `BookFile.Author` is `LazyLoaded<Author>` in C# -- ported as a plain populated field per this port's established LazyLoaded convention (see books/models.ts's header comment). */
  author: Author;
}

/** Forward-ref for the slice of NzbDrone.Core/Parser/Model/LocalBook.cs `TrackImportedEvent.BookInfo` exposes to this module's call sites. */
export interface LocalBookLike {
  path: string;
  quality: QualityModel;
  releaseGroup: string | null;
  size: number;
  indexerFlags: IndexerFlags | number;
  author: Author;
  book: Book;
}

/**
 * Forward-ref for NzbDrone.Core/MediaFiles/Events/TrackImportedEvent.cs.
 * `oldFiles` (C# `List<BookFile> OldFiles`) is omitted -- no ported call
 * site in this module reads it.
 */
export interface TrackImportedEvent {
  bookInfo: LocalBookLike;
  importedBook: BookFileLike;
  newDownload: boolean;
  downloadClientInfo: DownloadClientItemClientInfo | null;
  downloadId: string | null;
}

/** Ported from `TrackImportedEvent`'s constructor: derives `downloadClientInfo`/`downloadId` from the download item when present, matching the C# ctor's `if (downloadClientItem != null)` branch. */
export function newTrackImportedEvent(
  bookInfo: LocalBookLike,
  importedBook: BookFileLike,
  newDownload: boolean,
  downloadClientItem: DownloadClientItem | null
): TrackImportedEvent {
  return {
    bookInfo,
    importedBook,
    newDownload,
    downloadClientInfo: downloadClientItem?.downloadClientInfo ?? null,
    downloadId: downloadClientItem?.downloadId ?? null,
  };
}

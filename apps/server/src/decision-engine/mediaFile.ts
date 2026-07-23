import type { Author } from "../books/models.js";
import type { CustomFormat } from "../profiles/customFormat.js";
import type { QualityModel } from "../qualities/qualityModel.js";
import type { EntityHistoryRecord } from "./history.js";
import type { RemoteBook } from "./remoteBook.js";

/**
 * Forward-references for the `MediaFiles` module (Phase 3, not ported yet)
 * and the `CustomFormats` module (Phase 2, sibling worktree not merged) --
 * see remoteBook.ts's header comment for the general approach. Several
 * specifications (CutoffSpecification, RepackSpecification,
 * UpgradeDiskSpecification, UpgradeAllowedSpecification, QueueSpecification,
 * RssSync/*) need "does this book already have a file on disk, and what
 * quality/custom-formats does it have" -- these are the minimal shapes for
 * that.
 */

/** Forward-ref for the slice of NzbDrone.Core/MediaFiles/BookFile.cs DecisionEngine reads. */
export interface BookFile {
  id: number;
  path: string;
  quality: QualityModel;
  releaseGroup: string | null;
  dateAdded: string;
  author?: Author;
}

/** Forward-ref for the slice of NzbDrone.Core/MediaFiles/IMediaFileService.cs DecisionEngine calls. */
export interface MediaFileServiceLike {
  getFilesByBook(bookId: number): BookFile[];
}

/**
 * Forward-ref for the slice of
 * NzbDrone.Core/CustomFormats/ICustomFormatCalculationService.cs
 * DecisionEngine calls -- four of the six real overloads
 * (`ParseCustomFormat(RemoteBook, long size)`, `ParseCustomFormat(BookFile,
 * Author)`, `ParseCustomFormat(BookFile)`, `ParseCustomFormat(EntityHistory,
 * Author)`), matching the C# method-overload dispatch via distinctly-named
 * TS methods since TS doesn't overload on parameter count/type the way C#
 * does.
 */
export interface CustomFormatCalculationServiceLike {
  parseCustomFormatForRemoteBook(remoteBook: RemoteBook, size: number): CustomFormat[];
  parseCustomFormatForFile(file: BookFile, author?: Author): CustomFormat[];
  parseCustomFormatForHistory(history: EntityHistoryRecord, author: Author): CustomFormat[];
}

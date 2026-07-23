import type { LocalBook } from "../../../parser/model/localBook.js";
import { Decision } from "../../../decision-engine/decision.js";
import type {
  IImportDecisionEngineSpecification,
  DownloadClientItemLike,
} from "../importDecisionEngineSpecification.js";

/**
 * Ported from the slice of `IMediaFileService`/`BookFile` this
 * specification reads (`localBook.Book?.BookFiles?.Value`) -- same
 * "no bookFiles field on Edition/Book, query the real repository instead"
 * substitution as alreadyImportedSpecification.ts's `EditionFileLookup`.
 */
export interface BookFileLookup {
  getFilesByBook(bookId: number): { size: number }[];
}

/** Ported from NzbDrone.Core/MediaFiles/BookImport/Specifications/SameFileSpecification.cs. */
export class SameFileSpecification implements IImportDecisionEngineSpecification<LocalBook> {
  constructor(private readonly mediaFileService: BookFileLookup) {}

  isSatisfiedBy(
    localBook: LocalBook,
    _downloadClientItem: DownloadClientItemLike | null
  ): Decision {
    if (localBook.book === null) {
      return Decision.accept();
    }

    const bookFiles = this.mediaFileService.getFilesByBook(localBook.book.id);

    if (bookFiles.length === 0) {
      return Decision.accept();
    }

    for (const bookFile of bookFiles) {
      if (bookFile.size === localBook.size) {
        return Decision.reject("Has the same filesize as existing file");
      }
    }

    return Decision.accept();
  }
}

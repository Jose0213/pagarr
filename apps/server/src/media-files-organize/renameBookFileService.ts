import { extname } from "node:path";
import type { Author } from "../books/models.js";
import type { AuthorService } from "../books/authorService.js";
import type { FileNameBuilder } from "./organizer/fileNameBuilder.js";
import type { IMoveBookFiles } from "./bookFileMovingService.js";
import type { IExtendedDiskProvider } from "./diskProvider.js";
import { FileAlreadyExistsException, SameFilenameException } from "./errors.js";
import type { BookFile, MediaFileServiceLike } from "./types.js";
import type { RenameBookFilePreview } from "./renameBookFilePreview.js";
import type { RenamedBookFile } from "./renamedBookFile.js";

/**
 * Ported from NzbDrone.Core/MediaFiles/RenameBookFileService.cs.
 *
 * `IExecute<RenameFilesCommand>`/`IExecute<RenameAuthorCommand>` (Messaging
 * module command dispatch, Phase 4, not ported yet) are exposed as plain
 * `executeRenameFiles`/`executeRenameAuthor` methods a future command
 * dispatcher can wire up -- same deviation as recycleBinProvider.ts's
 * `execute()`. `IEventAggregator` publication
 * (`BookFileRenamedEvent`/`AuthorRenamedEvent`) becomes optional callbacks,
 * matching bookFileMovingService.ts's `onTrackFolderCreated` pattern.
 */
export interface RenameBookFileServiceOptions {
  onBookFileRenamed?: (author: Author, bookFile: BookFile, previousPath: string) => void;
  onAuthorRenamed?: (author: Author, renamed: RenamedBookFile[]) => void;
}

export interface IRenameBookFileService {
  getRenamePreviewsForAuthor(authorId: number): RenameBookFilePreview[];
  getRenamePreviewsForBook(authorId: number, bookId: number): RenameBookFilePreview[];
}

export class RenameBookFileService implements IRenameBookFileService {
  private readonly onBookFileRenamed?: (
    author: Author,
    bookFile: BookFile,
    previousPath: string
  ) => void;
  private readonly onAuthorRenamed?: (author: Author, renamed: RenamedBookFile[]) => void;

  constructor(
    private readonly authorService: Pick<AuthorService, "getAuthor" | "getAuthors">,
    private readonly mediaFileService: MediaFileServiceLike,
    private readonly bookFileMover: IMoveBookFiles,
    private readonly filenameBuilder: FileNameBuilder,
    private readonly diskProvider: IExtendedDiskProvider,
    options: RenameBookFileServiceOptions = {}
  ) {
    this.onBookFileRenamed = options.onBookFileRenamed;
    this.onAuthorRenamed = options.onAuthorRenamed;
  }

  /** Ported from `GetRenamePreviews(int authorId)`. */
  getRenamePreviewsForAuthor(authorId: number): RenameBookFilePreview[] {
    const author = this.authorService.getAuthor(authorId);
    const files = this.mediaFileService.getFilesByAuthor(authorId);

    return [...this.getPreviews(author, files)].sort((a, b) => {
      if (b.bookId !== a.bookId) {
        return b.bookId - a.bookId;
      }
      return a.existingPath.localeCompare(b.existingPath);
    });
  }

  /** Ported from `GetRenamePreviews(int authorId, int bookId)`. */
  getRenamePreviewsForBook(authorId: number, bookId: number): RenameBookFilePreview[] {
    const author = this.authorService.getAuthor(authorId);
    const files = this.mediaFileService.getFilesByBook(bookId);

    return [...this.getPreviews(author, files)].sort((a, b) =>
      a.existingPath.localeCompare(b.existingPath)
    );
  }

  /** Ported from the private `GetPreviews(Author author, List<BookFile> files)` iterator. */
  private *getPreviews(author: Author, files: BookFile[]): Generator<RenameBookFilePreview> {
    const counts = new Map<number, number>();
    for (const f of files) {
      counts.set(f.editionId, (counts.get(f.editionId) ?? 0) + 1);
    }

    // Don't rename Calibre files.
    for (const file of files.filter((x) => x.calibreId === 0)) {
      file.partCount = counts.get(file.editionId) ?? 0;

      const book = file.edition;
      const bookFilePath = file.path;

      if (!book) {
        // Matches the C# source's `_logger.Warn(...); continue;` -- no
        // logger ported yet (see this port's Instrumentation-not-ported
        // convention).
        continue;
      }

      const newName = this.filenameBuilder.buildBookFileName(author, book, file);
      const newPath = this.filenameBuilder.buildBookFilePath(
        author,
        book,
        newName,
        extname(bookFilePath)
      );

      if (bookFilePath !== newPath) {
        const bookId = book.book?.id ?? 0;
        yield {
          authorId: author.id,
          bookId,
          bookFileId: file.id,
          existingPath: file.path,
          newPath,
        };
      }
    }
  }

  private renameFiles(bookFiles: BookFile[], author: Author): void {
    const allFiles = this.mediaFileService.getFilesByAuthor(author.id);
    const counts = new Map<number, number>();
    for (const f of allFiles) {
      counts.set(f.editionId, (counts.get(f.editionId) ?? 0) + 1);
    }

    const renamed: RenamedBookFile[] = [];

    // Don't rename Calibre files.
    for (const bookFile of bookFiles.filter((x) => x.calibreId === 0)) {
      const previousPath = bookFile.path;
      bookFile.partCount = counts.get(bookFile.editionId) ?? 0;

      try {
        const moved = this.bookFileMover.moveBookFile(bookFile, author);

        this.mediaFileService.update(moved);

        renamed.push({ bookFile: moved, previousPath });

        this.onBookFileRenamed?.(author, moved, previousPath);
      } catch (e) {
        if (e instanceof FileAlreadyExistsException) {
          // Matches the C# source's Warn-log-and-continue for this case.
          continue;
        }
        if (e instanceof SameFilenameException) {
          // Matches the C# source's Debug-log-and-continue for this case.
          continue;
        }
        // Matches the C# source's Error-log-and-continue for any other exception.
      }
    }

    if (renamed.length > 0) {
      this.onAuthorRenamed?.(author, renamed);

      this.diskProvider.removeEmptySubfolders(author.path);
    }
  }

  /** Ported from `Execute(RenameFilesCommand message)`. See module doc comment on the Messaging-module deviation. */
  executeRenameFiles(authorId: number, fileIds: number[]): void {
    const author = this.authorService.getAuthor(authorId);
    const bookFiles = this.mediaFileService.get(fileIds);

    this.renameFiles(bookFiles, author);
  }

  /** Ported from `Execute(RenameAuthorCommand message)`. See module doc comment on the Messaging-module deviation. */
  executeRenameAuthor(authorIds: number[]): void {
    const authorsToRename = this.authorService.getAuthors(authorIds);

    for (const author of authorsToRename) {
      const bookFiles = this.mediaFileService.getFilesByAuthor(author.id);
      this.renameFiles(bookFiles, author);
    }
  }
}

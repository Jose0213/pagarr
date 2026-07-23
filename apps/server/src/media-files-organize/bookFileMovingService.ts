import { dirname, extname } from "node:path";
import type { Author, Book } from "../books/models.js";
import type { FileNameBuilder } from "./organizer/fileNameBuilder.js";
import type { IUpdateBookFileService } from "./updateBookFileService.js";
import type { IExtendedDiskProvider } from "./diskProvider.js";
import {
  DiskTransferService,
  TransferMode,
  type IDiskTransferService,
} from "./diskTransferService.js";
import type { IMediaFileAttributeService } from "./mediaFileAttributeService.js";
import { RootFolderNotFoundException, SameFilenameException } from "./errors.js";
import type { BookFile, EditionServiceLike, LocalBookLike } from "./types.js";

/**
 * Ported from NzbDrone.Core/MediaFiles/BookFileMovingService.cs.
 *
 * Sits directly on top of the Organizer naming-template engine
 * (`FileNameBuilder.buildBookFileName`/`buildBookFilePath`/`buildBookPath`)
 * -- per this module's task brief, this is the "everything that acts on a
 * filename once import has matched a file" layer, and is squarely in
 * known-issue #5 (filesystem permission friction) territory: every folder
 * this service creates goes through `ensureBookFolder`/`createFolder`,
 * which is exactly where a real deployment hits "Constant permission
 * issues" if the root/author/book folder isn't writable by the running
 * user. Ported precisely, not fixed -- see this module's task brief.
 *
 * `IEventAggregator`/`TrackFolderCreatedEvent` publication (Messaging
 * module, Phase 4, not ported yet): ported as an optional
 * `onTrackFolderCreated` callback, same deviation pattern as
 * root-folders/root-folder-service.ts's `onRootFolderAdded` stand-in.
 */

export interface TrackFolderCreatedInfo {
  author: Author;
  bookFile: BookFile;
  authorFolder?: string;
  bookFolder?: string;
  trackFolder?: string;
}

export interface IMoveBookFiles {
  moveBookFile(bookFile: BookFile, author: Author): BookFile;
  moveBookFileForImport(bookFile: BookFile, localBook: LocalBookLike): BookFile;
  copyBookFile(bookFile: BookFile, localBook: LocalBookLike): BookFile;
}

export interface BookFileMovingServiceOptions {
  onTrackFolderCreated?: (info: TrackFolderCreatedInfo) => void;
  /** Stand-in for `IConfigService.CopyUsingHardlinks`, read directly by `copyBookFile`. */
  copyUsingHardlinks: boolean;
}

export class BookFileMovingService implements IMoveBookFiles {
  private readonly diskTransferService: IDiskTransferService;
  private readonly onTrackFolderCreated?: (info: TrackFolderCreatedInfo) => void;
  private readonly copyUsingHardlinks: boolean;

  constructor(
    private readonly editionService: EditionServiceLike,
    private readonly updateBookFileService: IUpdateBookFileService,
    private readonly buildFileNames: FileNameBuilder,
    private readonly diskProvider: IExtendedDiskProvider,
    private readonly mediaFileAttributeService: IMediaFileAttributeService,
    options: BookFileMovingServiceOptions,
    diskTransferService?: IDiskTransferService
  ) {
    this.diskTransferService = diskTransferService ?? new DiskTransferService(diskProvider);
    this.onTrackFolderCreated = options.onTrackFolderCreated;
    this.copyUsingHardlinks = options.copyUsingHardlinks;
  }

  moveBookFile(bookFile: BookFile, author: Author): BookFile {
    const edition = this.editionService.getEdition(bookFile.editionId);
    const newFileName = this.buildFileNames.buildBookFileName(author, edition, bookFile);
    const filePath = this.buildFileNames.buildBookFilePath(
      author,
      edition,
      newFileName,
      extname(bookFile.path)
    );

    const book = edition.book;
    if (!book) {
      throw new Error("Edition has no linked Book -- cannot move book file");
    }

    this.ensureBookFolder(bookFile, author, book, filePath);

    return this.transferFile(bookFile, author, filePath, TransferMode.Move);
  }

  moveBookFileForImport(bookFile: BookFile, localBook: LocalBookLike): BookFile {
    const newFileName = this.buildFileNames.buildBookFileName(
      localBook.author,
      localBook.edition,
      bookFile
    );
    const filePath = this.buildFileNames.buildBookFilePath(
      localBook.author,
      localBook.edition,
      newFileName,
      extname(localBook.path)
    );

    this.ensureTrackFolder(bookFile, localBook, filePath);

    return this.transferFile(bookFile, localBook.author, filePath, TransferMode.Move);
  }

  copyBookFile(bookFile: BookFile, localBook: LocalBookLike): BookFile {
    const newFileName = this.buildFileNames.buildBookFileName(
      localBook.author,
      localBook.edition,
      bookFile
    );
    const filePath = this.buildFileNames.buildBookFilePath(
      localBook.author,
      localBook.edition,
      newFileName,
      extname(localBook.path)
    );

    this.ensureTrackFolder(bookFile, localBook, filePath);

    if (this.copyUsingHardlinks) {
      return this.transferFile(bookFile, localBook.author, filePath, TransferMode.HardLinkOrCopy);
    }

    return this.transferFile(bookFile, localBook.author, filePath, TransferMode.Copy);
  }

  private transferFile(
    bookFile: BookFile,
    author: Author,
    destinationFilePath: string,
    mode: TransferMode
  ): BookFile {
    const bookFilePath = bookFile.path;

    if (!this.diskProvider.fileExists(bookFilePath)) {
      throw new Error(`Book file path does not exist: ${bookFilePath}`);
    }

    if (bookFilePath === destinationFilePath) {
      throw new SameFilenameException(
        "File not moved, source and destination are the same",
        bookFilePath
      );
    }

    this.diskTransferService.transferFile(bookFilePath, destinationFilePath, mode);

    const moved: BookFile = { ...bookFile, path: destinationFilePath };

    const book = bookFile.edition?.book;
    if (book) {
      this.updateBookFileService.changeFileDateForFile(moved, book);
    }

    try {
      this.mediaFileAttributeService.setFolderLastWriteTime(author.path, new Date(moved.dateAdded));
    } catch {
      // Matches the C# source's catch-and-Warn-log wrapper around SetFolderLastWriteTime.
    }

    this.mediaFileAttributeService.setFilePermissions(destinationFilePath);

    return moved;
  }

  private ensureTrackFolder(bookFile: BookFile, localBook: LocalBookLike, filePath: string): void {
    this.ensureBookFolder(bookFile, localBook.author, localBook.book, filePath);
  }

  private ensureBookFolder(bookFile: BookFile, author: Author, book: Book, filePath: string): void {
    const trackFolder = dirname(filePath);
    const bookFolder = this.buildFileNames.buildBookPath(author);
    const authorFolder = author.path;
    const rootFolder = dirname(authorFolder);

    if (!this.diskProvider.folderExists(rootFolder)) {
      throw new RootFolderNotFoundException(`Root folder '${rootFolder}' was not found.`);
    }

    let changed = false;
    const info: TrackFolderCreatedInfo = { author, bookFile };

    if (!this.diskProvider.folderExists(authorFolder)) {
      this.createFolder(authorFolder);
      info.authorFolder = authorFolder;
      changed = true;
    }

    if (authorFolder !== bookFolder && !this.diskProvider.folderExists(bookFolder)) {
      this.createFolder(bookFolder);
      info.bookFolder = bookFolder;
      changed = true;
    }

    if (bookFolder !== trackFolder && !this.diskProvider.folderExists(trackFolder)) {
      this.createFolder(trackFolder);
      info.trackFolder = trackFolder;
      changed = true;
    }

    if (changed) {
      this.onTrackFolderCreated?.(info);
    }
  }

  private createFolder(directoryName: string): void {
    if (!directoryName || directoryName.trim() === "") {
      throw new Error("directoryName must not be null or whitespace");
    }

    const parentFolder = dirname(directoryName);
    if (parentFolder !== directoryName && !this.diskProvider.folderExists(parentFolder)) {
      this.createFolder(parentFolder);
    }

    try {
      this.diskProvider.createFolder(directoryName);
    } catch {
      // Matches the C# source's catch-and-Error-log wrapper around
      // IOException -- a failed mkdir here (permission denied, etc.) is
      // exactly known-issue #5's territory; the C# source deliberately
      // does NOT rethrow, so `setFolderPermissions` below still runs
      // (and itself fails silently if the folder was never created).
    }

    this.mediaFileAttributeService.setFolderPermissions(directoryName);
  }
}

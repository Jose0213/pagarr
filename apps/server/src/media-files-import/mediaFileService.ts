import type { AuthorMovedEvent, BookDeletedEvent } from "../books/index.js";
import type { RootFolder } from "../root-folders/index.js";
import type { BookFile } from "./bookFile.js";
import { DeleteMediaFileReason } from "./deleteMediaFileReason.js";
import { FilterFilesType } from "./filterFilesType.js";
import {
  BookFileAddedEvent,
  BookFileDeletedEvent,
  type IMediaFilesEventAggregator,
} from "./events.js";
import type { FileInfoLike } from "./mediaFileDiskProvider.js";
import type { MediaFileRepository } from "./mediaFileRepository.js";

/** Ported from `NzbDrone.Core.Datastore.Events.ModelEvent<RootFolder>` + `ModelAction.Deleted` -- the narrow slice `HandleAsync(ModelEvent<RootFolder>)` reads. */
export interface RootFolderDeletedEvent {
  action: "Deleted";
  model: RootFolder;
}

/** Ported from NzbDrone.Core/MediaFiles/MediaFileService.cs's `IMediaFileService`. */
export interface IMediaFileService {
  add(bookFile: BookFile): BookFile;
  addMany(bookFiles: BookFile[]): void;
  update(bookFile: BookFile): void;
  updateMany(bookFiles: BookFile[]): void;
  delete(bookFile: BookFile, reason: DeleteMediaFileReason): void;
  deleteMany(bookFiles: BookFile[], reason: DeleteMediaFileReason): void;
  getFilesByAuthor(authorId: number): BookFile[];
  getFilesByAuthorMetadataId(authorMetadataId: number): BookFile[];
  getFilesByBook(bookId: number): BookFile[];
  getFilesByEdition(editionId: number): BookFile[];
  getUnmappedFiles(): BookFile[];
  filterUnchangedFiles(files: FileInfoLike[], filter: FilterFilesType): FileInfoLike[];
  get(id: number): BookFile;
  getMany(ids: number[]): BookFile[];
  getFilesWithBasePath(path: string): BookFile[];
  getFileWithPathList(paths: string[]): BookFile[];
  getFileWithPath(path: string): BookFile | undefined;
  updateMediaInfo(bookFiles: BookFile[]): void;
  handleAuthorMoved(message: AuthorMovedEvent): void;
  handleBookDeleted(message: BookDeletedEvent): void;
  handleRootFolderDeleted(message: RootFolderDeletedEvent): void;
}

/**
 * Ported from NzbDrone.Core/MediaFiles/MediaFileService.cs.
 *
 * `IHandle<AuthorMovedEvent>`/`IHandleAsync<BookDeletedEvent>`/
 * `IHandleAsync<ModelEvent<RootFolder>>` (Messaging module event
 * subscriptions, Phase 4) are ported as plain public methods
 * (`handleAuthorMoved`/`handleBookDeleted`/`handleRootFolderDeleted`)
 * rather than an actual subscription mechanism -- same "no Messaging yet"
 * substitution as `books/events.ts`'s doc comment describes for
 * Handlers/. A caller wiring up the real event bus later calls these
 * directly from its own subscription.
 */
export class MediaFileService implements IMediaFileService {
  constructor(
    private readonly mediaFileRepository: MediaFileRepository,
    private readonly eventAggregator: IMediaFilesEventAggregator
  ) {}

  add(bookFile: BookFile): BookFile {
    const addedFile = this.mediaFileRepository.insert(bookFile);
    this.eventAggregator.publishEvent(new BookFileAddedEvent(addedFile));
    return addedFile;
  }

  addMany(bookFiles: BookFile[]): void {
    const inserted = this.mediaFileRepository.insertMany(bookFiles);
    for (const addedFile of inserted) {
      this.eventAggregator.publishEvent(new BookFileAddedEvent(addedFile));
    }
  }

  update(bookFile: BookFile): void {
    this.mediaFileRepository.update(bookFile);
  }

  updateMany(bookFiles: BookFile[]): void {
    this.mediaFileRepository.updateMany(bookFiles);
  }

  delete(bookFile: BookFile, reason: DeleteMediaFileReason): void {
    this.mediaFileRepository.delete(bookFile);

    // If the trackfile wasn't mapped to a track, don't publish an event
    if (bookFile.editionId > 0) {
      this.eventAggregator.publishEvent(new BookFileDeletedEvent(bookFile, reason));
    }
  }

  deleteMany(bookFiles: BookFile[], reason: DeleteMediaFileReason): void {
    this.mediaFileRepository.deleteMany(bookFiles);

    // publish events where trackfile was mapped to a track
    for (const bookFile of bookFiles.filter((x) => x.editionId > 0)) {
      this.eventAggregator.publishEvent(new BookFileDeletedEvent(bookFile, reason));
    }
  }

  /**
   * Ported from `MediaFileService.FilterUnchangedFiles(List<IFileInfo>
   * files, FilterFilesType filter)`: matches on-disk files against known
   * DB `BookFile` rows by path, then filters OUT files whose size AND
   * mtime (within 1 second) already match the DB row -- i.e. "nothing to
   * re-scan here". `FilterFilesType.Matched` additionally requires the DB
   * row to have an `edition` populated.
   *
   * DEVIATION: the real C# predicate is `DbFile.Edition == null ||
   * (Edition.IsLoaded && Edition.Value != null)` -- a `LazyLoaded<Edition>`
   * field with THREE possible states (bare-null field / loaded-with-value
   * / loaded-without-value), the first and second of which both count as
   * "matched". This port's `edition` field (no LazyLoaded wrapper, per
   * books/models.ts's convention) only has two states (`undefined` / a
   * real `Edition`), so it can't distinguish "field itself is null" from
   * "loaded but empty". In practice this doesn't matter: every `BookFile`
   * this service ever receives comes from `MediaFileRepository`'s own
   * join-based queries (mediaFileRepository.ts's `getFileWithPathList`),
   * which populate `.edition` exactly when a matching Editions row exists
   * and leave it `undefined` otherwise -- i.e. real repository data's
   * `.edition === undefined` always means "unmatched", the C# fixture's
   * bare-null-field "matched" case only arises for hand-constructed test
   * fixtures that never reach this service via the real repository path.
   * See `__tests__/mediaFileService.test.ts`'s doc comment for the full
   * detail and translated test coverage.
   */
  filterUnchangedFiles(files: FileInfoLike[], filter: FilterFilesType): FileInfoLike[] {
    if (filter === FilterFilesType.None) {
      return files;
    }

    const knownFiles = this.getFileWithPathList(files.map((x) => x.fullName));

    if (knownFiles.length === 0) {
      return files;
    }

    const byPath = new Map(knownFiles.map((f) => [f.path, f]));
    const combined = files
      .map((f) => ({ diskFile: f, dbFile: byPath.get(f.fullName) }))
      .filter((c): c is { diskFile: FileInfoLike; dbFile: BookFile } => c.dbFile !== undefined);

    let unwanted: FileInfoLike[];

    if (filter === FilterFilesType.Known) {
      unwanted = combined
        .filter((x) => sameSizeAndMtime(x.diskFile, x.dbFile))
        .map((x) => x.diskFile);
    } else if (filter === FilterFilesType.Matched) {
      unwanted = combined
        .filter((x) => sameSizeAndMtime(x.diskFile, x.dbFile) && x.dbFile.edition !== undefined)
        .map((x) => x.diskFile);
    } else {
      throw new Error("Unrecognised value of FilterFilesType filter");
    }

    const unwantedPaths = new Set(unwanted.map((x) => x.fullName));
    return files.filter((f) => !unwantedPaths.has(f.fullName));
  }

  get(id: number): BookFile {
    return this.mediaFileRepository.get(id);
  }

  getMany(ids: number[]): BookFile[] {
    return this.mediaFileRepository.getMany(ids);
  }

  getFilesWithBasePath(path: string): BookFile[] {
    return this.mediaFileRepository.getFilesWithBasePath(path);
  }

  getFileWithPathList(paths: string[]): BookFile[] {
    return this.mediaFileRepository.getFileWithPathList(paths);
  }

  getFileWithPath(path: string): BookFile | undefined {
    return this.mediaFileRepository.getFileWithPath(path);
  }

  getFilesByAuthor(authorId: number): BookFile[] {
    return this.mediaFileRepository.getFilesByAuthor(authorId);
  }

  getFilesByAuthorMetadataId(authorMetadataId: number): BookFile[] {
    return this.mediaFileRepository.getFilesByAuthorMetadataId(authorMetadataId);
  }

  getFilesByBook(bookId: number): BookFile[] {
    return this.mediaFileRepository.getFilesByBook(bookId);
  }

  getFilesByEdition(editionId: number): BookFile[] {
    return this.mediaFileRepository.getFilesByEdition(editionId);
  }

  getUnmappedFiles(): BookFile[] {
    return this.mediaFileRepository.getUnmappedFiles();
  }

  updateMediaInfo(bookFiles: BookFile[]): void {
    for (const bookFile of bookFiles) {
      this.mediaFileRepository.setFields(bookFile, ["mediaInfo"]);
    }
  }

  handleAuthorMoved(message: AuthorMovedEvent): void {
    const files = this.mediaFileRepository.getFilesWithBasePath(message.sourcePath);

    for (const file of files) {
      file.path = message.destinationPath + file.path.substring(message.sourcePath.length);
    }

    this.updateMany(files);
  }

  handleBookDeleted(message: BookDeletedEvent): void {
    if (message.deleteFiles) {
      this.mediaFileRepository.deleteFilesByBook(message.book.id);
    } else {
      this.mediaFileRepository.unlinkFilesByBook(message.book.id);
    }
  }

  handleRootFolderDeleted(message: RootFolderDeletedEvent): void {
    if (message.action === "Deleted") {
      const files = this.getFilesWithBasePath(message.model.path);
      this.deleteMany(files, DeleteMediaFileReason.Manual);
    }
  }
}

/** Ported from the `x.DiskFile.Length == x.DbFile.Size && Math.Abs((x.DiskFile.LastWriteTimeUtc - x.DbFile.Modified.ToUniversalTime()).TotalSeconds) <= 1` predicate shared by both filter branches. */
function sameSizeAndMtime(diskFile: FileInfoLike, dbFile: BookFile): boolean {
  if (diskFile.length !== dbFile.size) {
    return false;
  }
  const diffSeconds = Math.abs(
    (new Date(diskFile.lastWriteTimeUtc).getTime() - new Date(dbFile.modified).getTime()) / 1000
  );
  return diffSeconds <= 1;
}

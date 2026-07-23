import type { Author, Book, Edition } from "../books/models.js";

/**
 * Forward-references for modules the real C# Extras source depends on that
 * are NOT ported in this worktree yet -- `MediaFiles` (BookFile,
 * IMediaFileService, IMediaFileAttributeService, IDiskTransferService,
 * IRecycleBinProvider, DeleteMediaFileReason, RenamedBookFile, the
 * MediaFiles.Events.* event classes) and
 * `MediaFiles.BookImport.Aggregation` (IAugmentingService). Sibling
 * worktrees (`media-files-import`, `media-files-organize`,
 * `media-files-tags`) are porting pieces of `MediaFiles` in parallel but
 * won't be merged before this module lands -- see this module's top-level
 * task instructions.
 *
 * Every shape below is copied 1:1 (field names, method signatures) from the
 * real C# classes cited in each doc comment, narrowed to only the members
 * Extras' real source actually reads/calls. When the real modules land,
 * these should be deleted in favor of importing the real types -- shapes
 * were kept faithful specifically so that swap is mechanical, matching the
 * pattern established by decision-engine/remoteBook.ts and mediaFile.ts.
 */

// ---- MediaFiles/BookFile.cs ----

/**
 * Forward-ref for the slice of NzbDrone.Core/MediaFiles/BookFile.cs Extras
 * reads: `Path`, `Id`, `Edition` (LazyLoaded<Edition>, used via
 * `bookFile.Edition.Value.BookId`). `edition` is modeled as a plain
 * optional field (not a lazy wrapper) per this repo's established
 * LazyLoaded convention -- see books/models.ts's module doc comment.
 */
export interface BookFile {
  id: number;
  path: string;
  editionId: number;
  edition?: Edition;
  author?: Author;
}

/** Forward-ref for the slice of NzbDrone.Core/MediaFiles/IMediaFileService.cs Extras calls (ExtraService.GetBookFiles). */
export interface MediaFileServiceLike {
  getFilesByAuthor(authorId: number): BookFile[];
}

// ---- MediaFiles/DeleteMediaFileReason.cs, RenamedBookFile.cs ----

/** Forward-ref for NzbDrone.Core/MediaFiles/DeleteMediaFileReason.cs. */
export enum DeleteMediaFileReason {
  MissingFromDisk = "MissingFromDisk",
  Manual = "Manual",
  Upgrade = "Upgrade",
  NoLinkedEpisodes = "NoLinkedEpisodes",
  ManualOverride = "ManualOverride",
}

/** Forward-ref for NzbDrone.Core/MediaFiles/RenamedBookFile.cs. Unused by any Extras source method directly, kept for AuthorRenamedEvent's shape fidelity. */
export interface RenamedBookFile {
  bookFile: BookFile;
  previousPath: string;
}

// ---- MediaFiles/Events/*.cs, MediaCover/MediaCoversUpdatedEvent.cs ----

/** Forward-ref for NzbDrone.Core/MediaFiles/Events/AuthorScannedEvent.cs. */
export class AuthorScannedEvent {
  constructor(public readonly author: Author) {}
}

/**
 * Forward-ref for NzbDrone.Core/MediaCover/MediaCoversUpdatedEvent.cs. C#
 * has two constructor overloads (Author-only, Book-only) leaving the other
 * property null/undefined -- ported as a single constructor taking both as
 * optional, since TS has no overload dispatch and `ExtraService.Handle`
 * only ever reads `message.Author` anyway.
 */
export class MediaCoversUpdatedEvent {
  constructor(
    public readonly author?: Author,
    public readonly book?: Book
  ) {}
}

/** Forward-ref for NzbDrone.Core/MediaFiles/Events/TrackFolderCreatedEvent.cs. */
export class TrackFolderCreatedEvent {
  public authorFolder?: string;
  public bookFolder?: string;
  public trackFolder?: string;

  constructor(
    public readonly author: Author,
    public readonly bookFile: BookFile
  ) {}
}

/** Forward-ref for NzbDrone.Core/MediaFiles/Events/AuthorRenamedEvent.cs. */
export class AuthorRenamedEvent {
  constructor(
    public readonly author: Author,
    public readonly renamedFiles: RenamedBookFile[]
  ) {}
}

/** Forward-ref for NzbDrone.Core/MediaFiles/Events/BookFileDeletedEvent.cs. */
export class BookFileDeletedEvent {
  constructor(
    public readonly bookFile: BookFile,
    public readonly reason: DeleteMediaFileReason
  ) {}
}

// ---- Common/Disk: IDiskTransferService, TransferMode, IRecycleBinProvider ----

/** Forward-ref for NzbDrone.Common/Disk/TransferMode.cs. `[Flags]` in C#; `HardLinkOrCopy` is the `Copy | HardLink` combination, kept as its own member since Extras only ever compares against whole named values, never bitwise-combines at a call site. */
export enum TransferMode {
  None = 0,
  Move = 1,
  Copy = 2,
  HardLink = 4,
  HardLinkOrCopy = 6,
}

/** Forward-ref for the slice of NzbDrone.Common/Disk/IDiskTransferService.cs Extras calls (ExtraFileManager.ImportFile, MetadataService.ProcessBookMetadata). */
export interface DiskTransferServiceLike {
  transferFile(
    sourcePath: string,
    targetPath: string,
    mode: TransferMode,
    overwrite?: boolean
  ): TransferMode;
}

/** Forward-ref for NzbDrone.Core/MediaFiles/IRecycleBinProvider.cs (the slice Extras calls: DeleteFile only -- DeleteFolder/Empty/Cleanup are unused here). */
export interface RecycleBinProviderLike {
  deleteFile(path: string, subfolder?: string): void;
}

// ---- MediaFiles/MediaFileAttributeService.cs ----

/** Forward-ref for the slice of NzbDrone.Core/MediaFiles/IMediaFileAttributeService.cs Extras calls (SetFilePermissions only). */
export interface MediaFileAttributeServiceLike {
  setFilePermissions(path: string): void;
}

// ---- MediaFiles/BookImport/Aggregation/AugmentingService.cs ----

/**
 * Forward-ref for the narrow slice of
 * NzbDrone.Core/Parser/Model/LocalBook.cs that
 * `ExistingMetadataImporter`/`ExistingOtherExtraImporter` construct and
 * mutate directly (as opposed to the fuller `LocalBook` interface already
 * ported at parser/model/localBook.ts for the not-yet-connected
 * MediaFiles.BookImport.Identification pipeline). Both real call sites
 * build a `LocalBook { FileTrackInfo, Author, Path }` then read back
 * `.Book` after `IAugmentingService.Augment` populates it -- this local
 * shape captures exactly that round-trip without requiring every other
 * field the real `LocalBook` interface declares (`quality`,
 * `indexerFlags`, etc, which these two importers never touch).
 */
export interface AugmentableLocalBook {
  fileTrackInfo: unknown;
  author: Author;
  path: string;
  book?: Book | null;
}

/**
 * Forward-ref for the slice of
 * NzbDrone.Core/MediaFiles/BookImport/Aggregation/IAugmentingService.cs
 * Extras calls: `Augment(LocalBook, bool otherFiles)`. Throws
 * `AugmentingFailedException` (ported as a plain `AugmentingFailedError`
 * below) when the path can't be parsed as book info at all -- both real
 * callers (`ExistingMetadataImporter`, `ExistingOtherExtraImporter`) catch
 * that specific failure and skip the file rather than letting it propagate.
 */
export interface AugmentingServiceLike {
  augment(localBook: AugmentableLocalBook, otherFiles: boolean): AugmentableLocalBook;
}

/** Forward-ref for NzbDrone.Core/MediaFiles/BookImport/Aggregation/AugmentingFailedException.cs (a plain NzbDroneException subclass -- no extra fields). */
export class AugmentingFailedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AugmentingFailedError";
  }
}

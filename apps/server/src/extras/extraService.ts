import type { Author } from "../books/models.js";
import type { EditionService } from "../books/editionService.js";
import type { IConfigService } from "../config/configService.js";
import type { IManageExtraFiles } from "./extraFileManager.js";
import type { LocalBook } from "../parser/model/localBook.js";
import {
  type BookFile,
  type MediaFileServiceLike,
  type MediaCoversUpdatedEvent,
  type TrackFolderCreatedEvent,
  type AuthorRenamedEvent,
} from "./forwardRefs.js";

/**
 * Ported from NzbDrone.Core/Extras/ExtraService.cs.
 *
 * Constructor-injection deviation: `IDiskProvider` is unused by this
 * class's own method bodies in the real C# (it's injected but, like
 * `ExtraFileService`'s `IAuthorService`, never actually called) -- kept as
 * an unused constructor parameter for shape fidelity, not silently dropped.
 *
 * `IEnumerable<IManageExtraFiles> extraFileManagers` (DI-container
 * reflection scan) is ported per this task's "explicit over reflection"
 * instruction: callers pass the already-built array; sorted by `.order`
 * in the constructor exactly like the C# `.OrderBy(e => e.Order).ToList()`.
 * See `createDefaultExtraFileManagers.ts`.
 *
 * `IHandle<MediaCoversUpdatedEvent>`/`IHandle<TrackFolderCreatedEvent>`/
 * `IHandle<AuthorRenamedEvent>` are ported as plain public methods
 * (`handleMediaCoversUpdated`/`handleTrackFolderCreated`/
 * `handleAuthorRenamed`) rather than an `IHandle<T>` dispatch mechanism --
 * Messaging (Phase 4) isn't ported yet, matching this module's other
 * `handle*` methods (existingExtraFileService.ts).
 *
 * No NLog `Logger` -- `_logger.Warn(ex, "Failed to import extra file: {0}",
 * matchingFilename)` in `ImportExtraFiles`'s catch is dropped rather than
 * routed anywhere (Instrumentation, Phase 4, not ported), matching this
 * repo's established convention; the catch-and-continue BEHAVIOR (don't
 * let one bad file abort the whole import loop) is still faithfully
 * preserved below.
 *
 * ASYNC DEVIATION: `handleMediaCoversUpdated`/`handleTrackFolderCreated`
 * are `async` here (C#'s `Handle(...)` is synchronous `void`) because
 * `IManageExtraFiles.createAfterAuthorScan`/`createAfterBookImportWithFolders`
 * can return a `Promise` now that `metadata/metadataService.ts` implements
 * them asynchronously -- see that file's and extraFileManager.ts's module
 * doc comments. Each manager is still awaited in the same left-to-right
 * order the C# `foreach` loop ran them, and the per-manager return value is
 * still discarded either way (the real C# `Handle` methods never use it),
 * so observable behavior (what gets written, in what order) is unchanged
 * -- callers just need `await` where they previously didn't.
 */
export interface IExtraService {
  importBookFile(localBook: LocalBook, bookFile: BookFile, isReadOnly: boolean): void;
}

export class ExtraService implements IExtraService {
  private readonly extraFileManagers: IManageExtraFiles[];

  constructor(
    private readonly mediaFileService: MediaFileServiceLike,
    private readonly editionService: EditionService,
    private readonly configService: IConfigService,
    extraFileManagers: IManageExtraFiles[]
  ) {
    this.extraFileManagers = [...extraFileManagers].sort((a, b) => a.order - b.order);
  }

  /** Ported from ExtraService.ImportTrack(LocalBook localBook, BookFile bookFile, bool isReadOnly). */
  importBookFile(localBook: LocalBook, bookFile: BookFile, isReadOnly: boolean): void {
    this.importExtraFiles(localBook, bookFile, isReadOnly);

    if (!localBook.author) {
      throw new Error("localBook.author must be populated before importBookFile is called");
    }

    this.createAfterImport(localBook.author, bookFile);
  }

  /**
   * Ported from ExtraService.ImportExtraFiles(LocalBook localBook, BookFile
   * bookFile, bool isReadOnly). Deviation: `_diskProvider.GetParentFolder`/
   * `GetFiles` (not-yet-ported Common/Disk) are taken as extra parameters
   * (`getParentFolder`/`getFiles`) rather than constructor-injected, since
   * this specific method is the only place in the whole Extras module that
   * needs a directory listing -- matching this module's narrow-callback
   * convention without widening the class constructor for a single method.
   */
  importExtraFiles(
    localBook: LocalBook,
    bookFile: BookFile,
    isReadOnly: boolean,
    getParentFolder: (path: string) => string = defaultGetParentFolder,
    getFiles: (folder: string) => string[] = () => []
  ): void {
    if (!this.configService.importExtraFiles) {
      return;
    }

    const sourcePath = localBook.path;
    const sourceFolder = getParentFolder(sourcePath);
    const sourceFileName = getFileNameWithoutExtension(sourcePath);
    const files = getFiles(sourceFolder);

    const wantedExtensions = this.configService.extraFileExtensions
      .split(",")
      .map((e) => e.trim())
      .filter((e) => e.length > 0)
      .map((e) => e.replace(/^[. ]+|[. ]+$/g, ""));

    const matchingFilenames = files.filter((f) =>
      getFileNameWithoutExtension(f).toLowerCase().startsWith(sourceFileName.toLowerCase())
    );

    const filteredFilenames: string[] = [];
    let hasNfo = false;

    for (const matchingFilename of matchingFilenames) {
      // Filter out duplicate NFO files.
      if (matchingFilename.toLowerCase().endsWith(".nfo")) {
        if (hasNfo) {
          continue;
        }
        hasNfo = true;
      }

      filteredFilenames.push(matchingFilename);
    }

    for (const matchingFilename of filteredFilenames) {
      const matchingExtension = wantedExtensions.find((e) => matchingFilename.endsWith(e));

      if (matchingExtension === undefined) {
        continue;
      }

      try {
        for (const extraFileManager of this.extraFileManagers) {
          const extension = getExtension(matchingFilename);
          if (!localBook.author) {
            throw new Error("localBook.author must be populated before importExtraFiles is called");
          }
          const extraFile = extraFileManager.import(
            localBook.author,
            bookFile,
            matchingFilename,
            extension,
            isReadOnly
          );

          if (extraFile !== null) {
            break;
          }
        }
      } catch {
        // Ported: C# logs a warning ("Failed to import extra file: {0}")
        // and continues to the next file rather than aborting the loop.
      }
    }
  }

  private createAfterImport(author: Author, bookFile: BookFile): void {
    for (const extraFileManager of this.extraFileManagers) {
      extraFileManager.createAfterBookImport(author, bookFile);
    }
  }

  /** Ported from ExtraService.Handle(MediaCoversUpdatedEvent message). See module doc comment re: async deviation. */
  async handleMediaCoversUpdated(message: MediaCoversUpdatedEvent): Promise<void> {
    const author = message.author;
    if (!author) {
      return;
    }

    const bookFiles = this.getBookFiles(author.id);

    for (const extraFileManager of this.extraFileManagers) {
      await extraFileManager.createAfterAuthorScan(author, bookFiles);
    }
  }

  /** Ported from ExtraService.Handle(TrackFolderCreatedEvent message). See module doc comment re: async deviation. */
  async handleTrackFolderCreated(message: TrackFolderCreatedEvent): Promise<void> {
    const author = message.author;
    const edition = this.editionService.getEdition(message.bookFile.editionId);

    if (!edition.book) {
      throw new Error(`Edition ${edition.id}'s book has not been loaded`);
    }

    for (const extraFileManager of this.extraFileManagers) {
      await extraFileManager.createAfterBookImportWithFolders(
        author,
        edition.book,
        message.authorFolder ?? null,
        message.bookFolder ?? null
      );
    }
  }

  /** Ported from ExtraService.Handle(AuthorRenamedEvent message). */
  handleAuthorRenamed(message: AuthorRenamedEvent): void {
    const author = message.author;
    const bookFiles = this.getBookFiles(author.id);

    for (const extraFileManager of this.extraFileManagers) {
      extraFileManager.moveFilesAfterRename(author, bookFiles);
    }
  }

  private getBookFiles(authorId: number): BookFile[] {
    return this.mediaFileService.getFilesByAuthor(authorId);
  }
}

/** Ported from `Path.GetFileNameWithoutExtension`. */
function getFileNameWithoutExtension(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const base = normalized.slice(normalized.lastIndexOf("/") + 1);
  const dotIndex = base.lastIndexOf(".");
  return dotIndex > 0 ? base.slice(0, dotIndex) : base;
}

/** Ported from `Path.GetExtension`. */
function getExtension(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const base = normalized.slice(normalized.lastIndexOf("/") + 1);
  const dotIndex = base.lastIndexOf(".");
  return dotIndex > 0 ? base.slice(dotIndex) : "";
}

/** Default no-op-ish `getParentFolder` fallback: returns the input's directory via plain string splitting (Common/Disk not ported yet -- see method doc comment). */
function defaultGetParentFolder(path: string): string {
  const trimmed = path.replace(/[/\\]+$/, "");
  const idx = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
  return idx === -1 ? "" : trimmed.slice(0, idx);
}

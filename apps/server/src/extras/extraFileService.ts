import type { ExtraFile } from "./extraFile.js";
import type { IExtraFileRepository } from "./extraFileRepository.js";
import type { AuthorService } from "../books/authorService.js";
import {
  DeleteMediaFileReason,
  type BookFile,
  type BookFileDeletedEvent,
  type RecycleBinProviderLike,
} from "./forwardRefs.js";

/**
 * Ported from NzbDrone.Core/Extras/Files/ExtraFileService.cs.
 *
 * Constructor-injection deviation (per this module's task instructions --
 * "plain constructor injection / factory functions, no DI container"): C#'s
 * `IDiskProvider` is only used by this class to `FileExists()`-check the
 * on-disk path immediately before deciding whether to recycle it in
 * `Handle(BookFileDeletedEvent)`. Rather than add a full forward-ref for
 * the not-yet-ported Common/Disk `IDiskProvider` interface just for that
 * one boolean check, `fileExists` is injected as a narrow callback
 * (matching root-folders/root-folder-service.ts's callback-for-un-ported-
 * dependency pattern), same shape as `root-folders/disk-provider.ts`'s
 * `IDiskProvider.folderExists`.
 *
 * `IAuthorService` is injected (constructor parameter kept for shape
 * fidelity with the real C# constructor) but -- faithfully preserving the
 * real source -- never actually called anywhere in `ExtraFileService.cs`'s
 * method bodies. It's stored here the same way, unused, rather than
 * silently dropped, so a reader diffing against the C# constructor sees
 * the same dependency list.
 *
 * `Handle(AuthorDeletedEvent)`/`HandleAsync` and `Handle(BookFileDeletedEvent)`
 * are both real ported behavior (not stubbed): the Messaging module's
 * `IHandle`/`IHandleAsync` dispatch machinery isn't ported yet (Phase 4),
 * so these are exposed as plain public methods (`handleAuthorDeleted`/
 * `handleBookFileDeleted`) a future event-bus wiring can call directly,
 * matching books/authorService.ts and similar Phase-1 services that predate
 * Messaging.
 */
export interface IExtraFileService<TExtraFile extends ExtraFile> {
  getFilesByAuthor(authorId: number): TExtraFile[];
  getFilesByBookFile(bookFileId: number): TExtraFile[];
  findByPath(authorId: number, path: string): TExtraFile | undefined;
  upsert(extraFile: TExtraFile): void;
  upsertMany(extraFiles: TExtraFile[]): void;
  delete(id: number): void;
  deleteMany(ids: number[]): void;
}

export interface ExtraFileServiceOptions {
  /** Stand-in for the not-yet-ported `IDiskProvider.FileExists` -- see module doc comment. */
  fileExists?: (path: string) => boolean;
}

export class ExtraFileService<
  TExtraFile extends ExtraFile,
> implements IExtraFileService<TExtraFile> {
  private readonly fileExists: (path: string) => boolean;

  constructor(
    private readonly repository: IExtraFileRepository<TExtraFile>,
    private readonly authorService: AuthorService,
    private readonly recycleBinProvider: RecycleBinProviderLike,
    options: ExtraFileServiceOptions = {}
  ) {
    this.fileExists = options.fileExists ?? (() => false);
  }

  getFilesByAuthor(authorId: number): TExtraFile[] {
    return this.repository.getFilesByAuthor(authorId);
  }

  getFilesByBookFile(bookFileId: number): TExtraFile[] {
    return this.repository.getFilesByBookFile(bookFileId);
  }

  findByPath(authorId: number, path: string): TExtraFile | undefined {
    return this.repository.findByPath(authorId, path);
  }

  upsert(extraFile: TExtraFile): void {
    this.upsertMany([extraFile]);
  }

  /**
   * Ported from ExtraFileService.Upsert(List<TExtraFile> extraFiles):
   * stamps `LastUpdated` (and `Added`, only for brand-new rows) on every
   * item, then splits into inserts (id === 0) vs updates (id > 0) and
   * dispatches each batch, matching the C# original's
   * `_repository.InsertMany(...)` / `_repository.UpdateMany(...)` split.
   */
  upsertMany(extraFiles: TExtraFile[]): void {
    const now = new Date().toISOString();

    for (const file of extraFiles) {
      file.lastUpdated = now;
      if (file.id === 0) {
        file.added = file.lastUpdated;
      }
    }

    const toInsert = extraFiles.filter((m) => m.id === 0);
    const toUpdate = extraFiles.filter((m) => m.id > 0);

    if (toInsert.length > 0) {
      this.repository.insertMany(toInsert);
    }
    if (toUpdate.length > 0) {
      this.repository.updateMany(toUpdate);
    }
  }

  delete(id: number): void {
    this.repository.delete(id);
  }

  deleteMany(ids: number[]): void {
    this.repository.deleteMany(ids);
  }

  /** Ported from ExtraFileService.HandleAsync(AuthorDeletedEvent message). */
  handleAuthorDeleted(authorId: number): void {
    this.repository.deleteForAuthor(authorId);
  }

  /**
   * Ported from ExtraFileService.Handle(BookFileDeletedEvent message).
   * `author` is passed explicitly rather than read off
   * `message.BookFile.Author.Value` (a C# `LazyLoaded<Author>`) -- see this
   * repo's LazyLoaded convention note in books/models.ts; callers populate
   * it themselves before invoking this handler.
   */
  handleBookFileDeleted(message: BookFileDeletedEvent, author: { path: string }): void {
    const bookFile: BookFile = message.bookFile;

    if (message.reason === DeleteMediaFileReason.NoLinkedEpisodes) {
      // Removing track file from DB as part of cleanup routine, not deleting extra files from disk.
    } else {
      for (const extra of this.repository.getFilesByBookFile(bookFile.id)) {
        const path = joinPath(author.path, extra.relativePath);

        if (this.fileExists(path)) {
          // Send to the recycling bin so they can be recovered if necessary.
          const subfolder = getSubfolder(author.path, path);
          this.recycleBinProvider.deleteFile(path, subfolder);
        }
      }
    }

    this.repository.deleteForBookFile(bookFile.id);
  }
}

/**
 * Ported from `Path.Combine(author.Path, extra.RelativePath)`. A minimal
 * local join (not node:path's `join`, which normalizes `..`/`.` segments
 * C#'s `Path.Combine` doesn't) -- matching this module's other path-join
 * call sites (extraFileManager.ts uses the same helper).
 */
function joinPath(base: string, relative: string): string {
  if (base.endsWith("/") || base.endsWith("\\")) {
    return base + relative;
  }
  const sep = base.includes("\\") && !base.includes("/") ? "\\" : "/";
  return base + sep + relative;
}

/**
 * Ported from `_diskProvider.GetParentFolder(author.Path).GetRelativePath(_diskProvider.GetParentFolder(path))`:
 * the recycle-bin subfolder is the deleted file's parent directory, relative
 * to the author folder's OWN parent (i.e. `<AuthorFolderName>/<...
 * subpath.../>`), so recycled files land under a same-named subfolder in
 * the recycle bin rather than flattening every author's files together.
 */
function getSubfolder(authorPath: string, filePath: string): string {
  const authorParent = getParentFolder(authorPath);
  const fileParent = getParentFolder(filePath);

  if (fileParent.length <= authorParent.length) {
    return "";
  }

  return fileParent.slice(authorParent.length).replace(/^[/\\]+/, "");
}

function getParentFolder(path: string): string {
  const trimmed = path.replace(/[/\\]+$/, "");
  const idx = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
  return idx === -1 ? "" : trimmed.slice(0, idx);
}

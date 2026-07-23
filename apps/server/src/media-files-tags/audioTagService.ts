import { extname } from "node:path";
import { statSync } from "node:fs";
import { CorruptFileError, File as TagLibFile, TagTypes } from "node-taglib-sharp";
import { AudioTag, type AudioTagDiff, type AudioTagLogger } from "./audioTag.js";
import { MediaFileExtensions } from "../parser/qualityParser.js";
import type { ParsedTrackInfo } from "../parser/model/parsedTrackInfo.js";
import { newRetagBookFilePreview, type RetagBookFilePreview } from "./retagBookFilePreview.js";
import type { BookFileRef, EditionRef } from "./audioTagTypes.js";
import type { RetagAuthorCommand, RetagFilesCommand } from "./ebookTagTypes.js";

/**
 * Ported from NzbDrone.Core/MediaFiles/AudioTagService.cs.
 *
 * Dependency notes (constructor-injection deviation, per this repo's
 * PORT_PLAN.md convention -- plain constructor injection / factory
 * functions, no DI container):
 *   - `IConfigService` (`WriteAudioTags`, `ScrubAudioTags`): the real
 *     already-ported `apps/server/src/config/configService.ts` (Phase 1)
 *     has both fields; narrowed to `AudioConfigServiceLike` here (this
 *     module's convention -- see ebookTagService.ts's
 *     `EbookConfigServiceLike`) so this file doesn't need to import the
 *     full concrete `ConfigService` class.
 *   - `IMediaFileService` (`Update`, plus the `Get*`/retag-preview methods
 *     shared with EbookTagService) and `BookFile` are Phase 3 (MediaFiles,
 *     sibling `media-files-import` worktree, not merged) --
 *     forward-referenced via `MediaFileServiceLike`/`BookFileRef`
 *     (audioTagTypes.ts), same pattern as `decision-engine/mediaFile.ts`.
 *   - `IDiskProvider.GetFileInfo` (`.Length`, `.LastWriteTimeUtc`) --
 *     the real ported `apps/server/src/root-folders/disk-provider.ts`
 *     `IDiskProvider` is deliberately narrowed to only what
 *     RootFolderService needs (see that file's header comment) and has no
 *     `GetFileInfo`/`GetFileSize` method; this module defines its own
 *     narrow `AudioDiskProviderLike` (`getFileInfo`/`getFileSize`) rather
 *     than widening the shared RootFolders one, following that same
 *     "narrow, needs-based interface" convention.
 *   - `IRootFolderWatchingService.ReportFileSystemChangeBeginning` --
 *     `NzbDrone.Core/MediaFiles/RootFolderWatchingService.cs` (a
 *     filesystem-watcher debounce service) isn't ported anywhere yet
 *     (Phase 3-adjacent, not in this module's scope) -- forward-referenced
 *     as a single-method `RootFolderWatchingServiceLike` with a no-op
 *     default.
 *   - `IAuthorService`/`Author` -- the real already-ported
 *     `apps/server/src/books/` types (Phase 1), narrowed the same way
 *     ebookTagService.ts does (`AuthorServiceLike`).
 *   - `IMapCoversToLocal.GetCoverPath` (`NzbDrone.Core/MediaCover/`) isn't
 *     ported yet -- forward-referenced as `CoverPathResolverLike`.
 *   - `IEventAggregator.PublishEvent(new BookFileRetaggedEvent(...))` --
 *     `NzbDrone.Core/Messaging/Events/IEventAggregator` (Phase 4) isn't
 *     ported; `books/events.ts` already established the pattern this
 *     module follows: a narrowed `IEventAggregator`-shaped interface plus
 *     a `BookFileRetaggedEvent` plain-data class defined locally (see
 *     bookFileRetaggedEvent.ts) with a no-op default aggregator.
 */

export interface AudioTagServiceLogger extends AudioTagLogger {
  progressInfo(message: string, ...args: unknown[]): void;
}

const noopLogger: AudioTagServiceLogger = {
  debug: () => {},
  trace: () => {},
  warn: () => {},
  error: () => {},
  progressInfo: () => {},
};

/** Narrowed to the slice of NzbDrone.Core/Configuration/IConfigService.cs this module needs. */
export interface AudioConfigServiceLike {
  writeAudioTags: "no" | "newFiles" | "sync" | (string & {});
  scrubAudioTags: boolean;
}

/** Forward-ref for the slice of NzbDrone.Core/MediaFiles/IMediaFileService.cs this module needs. */
export interface AudioMediaFileServiceLike {
  getFilesByAuthor(authorId: number): BookFileRef[];
  getFilesByBook(bookId: number): BookFileRef[];
  get(ids: number[]): BookFileRef[];
  update(file: BookFileRef): void;
}

/** Narrowed file-stat surface this module needs (see module doc comment for why it's separate from root-folders/disk-provider.ts's IDiskProvider). */
export interface AudioDiskProviderLike {
  getFileInfo(path: string): { length: number; lastWriteTimeUtc: string };
  getFileSize(path: string): number;
}

/** Forward-ref for NzbDrone.Core/MediaFiles/RootFolderWatchingService.cs's `ReportFileSystemChangeBeginning`. */
export interface RootFolderWatchingServiceLike {
  reportFileSystemChangeBeginning(path: string): void;
}

/** Narrowed to the slice of NzbDrone.Core/Books/IAuthorService.cs this module needs. */
export interface AudioAuthorServiceLike {
  getAuthor(authorId: number): { id: number; name: string };
  getAuthors(authorIds: number[]): { id: number; name: string }[];
}

/** Forward-ref for the slice of NzbDrone.Core/MediaCover/IMapCoversToLocal.cs this module needs. */
export interface CoverPathResolverLike {
  getCoverPath(
    entityId: number,
    entity: "book",
    coverType: string,
    extension: string | null,
    size: number | null
  ): string;
}

/** Ported from NzbDrone.Core/MediaFiles/Events/BookFileRetaggedEvent.cs -- see module doc comment. */
export class BookFileRetaggedEvent {
  constructor(
    public readonly author: { id: number; name: string },
    public readonly bookFile: BookFileRef,
    public readonly diff: AudioTagDiff,
    public readonly scrubbed: boolean
  ) {}
}

/** Narrowed IEventAggregator (see books/events.ts's IBooksEventAggregator for the established pattern this mirrors). */
export interface AudioEventAggregatorLike {
  publishEvent(event: BookFileRetaggedEvent): void;
}

export const noopAudioEventAggregator: AudioEventAggregatorLike = {
  publishEvent: () => {},
};

export interface AudioTagServiceDeps {
  configService: AudioConfigServiceLike;
  mediaFileService: AudioMediaFileServiceLike;
  diskProvider: AudioDiskProviderLike;
  rootFolderWatchingService: RootFolderWatchingServiceLike;
  authorService: AudioAuthorServiceLike;
  coverPathResolver: CoverPathResolverLike;
  eventAggregator?: AudioEventAggregatorLike;
  logger?: AudioTagServiceLogger;
}

export class AudioTagService {
  private readonly configService: AudioConfigServiceLike;
  private readonly mediaFileService: AudioMediaFileServiceLike;
  private readonly diskProvider: AudioDiskProviderLike;
  private readonly rootFolderWatchingService: RootFolderWatchingServiceLike;
  private readonly authorService: AudioAuthorServiceLike;
  private readonly coverPathResolver: CoverPathResolverLike;
  private readonly eventAggregator: AudioEventAggregatorLike;
  private readonly logger: AudioTagServiceLogger;

  constructor(deps: AudioTagServiceDeps) {
    this.configService = deps.configService;
    this.mediaFileService = deps.mediaFileService;
    this.diskProvider = deps.diskProvider;
    this.rootFolderWatchingService = deps.rootFolderWatchingService;
    this.authorService = deps.authorService;
    this.coverPathResolver = deps.coverPathResolver;
    this.eventAggregator = deps.eventAggregator ?? noopAudioEventAggregator;
    this.logger = deps.logger ?? noopLogger;
  }

  /** Ported from `AudioTagService.ReadAudioTag(string path)`. */
  readAudioTag(path: string): AudioTag {
    return new AudioTag(path, this.logger);
  }

  /** Ported from `AudioTagService.ReadTags(string path)` (implicit `AudioTag -> ParsedTrackInfo` conversion). */
  readTags(path: string): ParsedTrackInfo {
    return new AudioTag(path, this.logger).toParsedTrackInfo();
  }

  /** Ported from `AudioTagService.GetTrackMetadata(BookFile trackfile)`. */
  getTrackMetadata(trackfile: BookFileRef): AudioTag {
    const edition = trackfile.edition;
    const book = edition?.book;
    const author = book?.author;
    const partCount = edition?.bookFiles?.length ?? 0;

    const fileTags = this.readAudioTag(trackfile.path);

    // Ported from `edition.Images.FirstOrDefault(x => x.CoverType == MediaCoverTypes.Cover)`.
    // `MediaCoverTypes` (NzbDrone.Core/MediaCover/MediaCover.cs) isn't ported;
    // `MediaCoverImage.coverType` is a plain `string` on the real ported type
    // (books/models.ts) -- matched against the C# enum member's `.ToString()`
    // spelling, `"Cover"`.
    const cover = (edition?.images ?? []).find((x) => x.coverType === "Cover");
    let imageFile: string | null = null;
    let imageSize = 0;
    if (cover && book) {
      // Ported from `cover.Extension` (`MediaCover.Extension`, computed as
      // `Path.GetExtension(Url)` when `Url` is set -- see MediaCover.cs).
      // The ported `MediaCoverImage` has no `extension` field, so it's
      // derived the same way here rather than expecting a stored one.
      const extension = extname(cover.url) || null;
      imageFile = this.coverPathResolver.getCoverPath(
        book.id,
        "book",
        cover.coverType,
        extension,
        null
      );
      this.logger.trace(`Embedding: ${imageFile}`);
      const fileInfo = this.diskProvider.getFileInfo(imageFile);
      if (fileInfo && fileExists(imageFile)) {
        imageSize = fileInfo.length;
      } else {
        imageFile = null;
      }
    }

    const tag = new AudioTag(undefined, this.logger);
    tag.title = edition?.title ?? null;
    tag.performers = author ? [author.metadata?.name ?? ""] : [];
    tag.bookAuthors = author ? [author.metadata?.name ?? ""] : [];
    tag.track = trackfile.part;
    tag.trackCount = partCount;
    tag.book = book?.title ?? null;
    tag.disc = fileTags.disc;
    tag.discCount = fileTags.discCount;

    // We may have omitted media so index in the list isn't the same as medium number.
    tag.media = fileTags.media;
    tag.date = edition?.releaseDate ? new Date(edition.releaseDate) : null;
    tag.year = edition?.releaseDate ? new Date(edition.releaseDate).getUTCFullYear() : 0;
    tag.originalReleaseDate = book?.releaseDate ? new Date(book.releaseDate) : null;
    tag.originalYear = book?.releaseDate ? new Date(book.releaseDate).getUTCFullYear() : 0;
    tag.publisher = edition?.publisher ?? null;
    tag.genres = [];
    tag.imageFile = imageFile;
    tag.imageSize = imageSize;

    return tag;
  }

  private updateTrackfileSizeAndModified(trackfile: BookFileRef, path: string): void {
    // Update the saved file size so that the importer doesn't get confused on the next scan.
    const fileInfo = this.diskProvider.getFileInfo(path);
    trackfile.size = fileInfo.length;
    trackfile.modified = fileInfo.lastWriteTimeUtc;

    if (trackfile.id > 0) {
      this.mediaFileService.update(trackfile);
    }
  }

  /**
   * Ported from `AudioTagService.RemoveAllTags(string path)`. Delegates to
   * `TagLib.File` directly (via `removeAllTagsFromFile`), matching the C#
   * source, which calls `TagLib.File.Create`/`RemoveTags`/`Save` directly
   * rather than going through `AudioTag`.
   */
  removeAllTags(path: string): void {
    removeAllTagsFromFile(path, this.logger);
  }

  /** Ported from `AudioTagService.WriteTags(BookFile trackfile, bool newDownload, bool force = false)`. */
  writeTags(trackfile: BookFileRef, newDownload: boolean, force = false): void {
    if (!force) {
      if (this.configService.writeAudioTags === "no") {
        return;
      }
      if (this.configService.writeAudioTags === "newFiles" && !newDownload) {
        return;
      }
    }

    const newTags = this.getTrackMetadata(trackfile);
    const path = trackfile.path;

    const diff = this.readAudioTag(path).diff(newTags);

    if (Object.keys(diff).length === 0) {
      this.logger.debug(`No tags update for ${trackfile.path} due to no difference`);
      return;
    }

    this.rootFolderWatchingService.reportFileSystemChangeBeginning(path);

    if (this.configService.scrubAudioTags) {
      this.logger.debug(`Scrubbing tags for ${trackfile.path}`);
      this.removeAllTags(path);
    }

    this.logger.debug(`Writing tags for ${trackfile.path}`);

    newTags.write(path);

    this.updateTrackfileSizeAndModified(trackfile, path);

    const authorSummary = trackfile.author
      ? { id: trackfile.author.id, name: trackfile.author.metadata?.name ?? "" }
      : { id: 0, name: "" };
    this.eventAggregator.publishEvent(
      new BookFileRetaggedEvent(authorSummary, trackfile, diff, this.configService.scrubAudioTags)
    );
  }

  /** Ported from `AudioTagService.SyncTags(List<Edition> editions)`. */
  syncTags(editions: EditionRef[]): void {
    if (this.configService.writeAudioTags !== "sync") {
      return;
    }

    for (const edition of editions) {
      const bookFiles = edition.bookFiles ?? [];

      this.logger.debug(`Syncing audio tags for ${bookFiles.length} files`);

      for (const file of bookFiles.filter((x) =>
        MediaFileExtensions.AudioExtensions.has(extname(x.path))
      )) {
        file.edition = edition;
        this.writeTags(file, false);
      }
    }
  }

  /** Ported from `AudioTagService.GetRetagPreviewsByAuthor(int authorId)`. */
  getRetagPreviewsByAuthor(authorId: number): RetagBookFilePreview[] {
    const files = this.mediaFileService.getFilesByAuthor(authorId);
    return this.getPreviews(files)
      .slice()
      .sort((a, b) => a.bookId - b.bookId || a.path.localeCompare(b.path));
  }

  /** Ported from `AudioTagService.GetRetagPreviewsByBook(int bookId)`. */
  getRetagPreviewsByBook(bookId: number): RetagBookFilePreview[] {
    const files = this.mediaFileService.getFilesByBook(bookId);
    return this.getPreviews(files)
      .slice()
      .sort((a, b) => a.bookId - b.bookId || a.path.localeCompare(b.path));
  }

  private getPreviews(files: BookFileRef[]): RetagBookFilePreview[] {
    const results: RetagBookFilePreview[] = [];

    const audioFiles = files
      .filter((x) => MediaFileExtensions.AudioExtensions.has(extname(x.path)))
      .slice()
      .sort((a, b) => (a.edition?.title ?? "").localeCompare(b.edition?.title ?? ""));

    for (const file of audioFiles) {
      if (!file.edition) {
        this.logger.warn(`File ${file.path} is not linked to any books`);
        continue;
      }

      const oldTags = this.readAudioTag(file.path);
      const newTags = this.getTrackMetadata(file);
      const diff = oldTags.diff(newTags);

      if (Object.keys(diff).length > 0) {
        results.push(
          newRetagBookFilePreview({
            authorId: file.author?.id ?? 0,
            bookId: file.edition.id,
            bookFileId: file.id,
            path: file.path,
            changes: diff,
          })
        );
      }
    }

    return results;
  }

  /** Ported from `AudioTagService.RetagFiles(RetagFilesCommand message)`. */
  retagFiles(message: RetagFilesCommand): void {
    const author = this.authorService.getAuthor(message.authorId);
    const bookFiles = this.mediaFileService.get(message.files);
    const audioFiles = bookFiles.filter((x) =>
      MediaFileExtensions.AudioExtensions.has(extname(x.path))
    );

    this.logger.progressInfo("Re-tagging %d audio files for %s", audioFiles.length, author.name);
    for (const file of audioFiles) {
      this.writeTags(file, false, true);
    }

    this.logger.progressInfo("Selected audio files re-tagged for %s", author.name);
  }

  /** Ported from `AudioTagService.RetagAuthor(RetagAuthorCommand message)`. */
  retagAuthor(message: RetagAuthorCommand): void {
    this.logger.debug("Re-tagging all audio files for selected authors");
    const authorsToRename = this.authorService.getAuthors(message.authorIds);

    for (const author of authorsToRename) {
      const bookFiles = this.mediaFileService.getFilesByAuthor(author.id);
      const audioFiles = bookFiles.filter((x) =>
        MediaFileExtensions.AudioExtensions.has(extname(x.path))
      );

      this.logger.progressInfo("Re-tagging all audio files for author: %s", author.name);
      for (const file of audioFiles) {
        this.writeTags(file, false, true);
      }

      this.logger.progressInfo("All audio files re-tagged for %s", author.name);
    }
  }
}

function fileExists(path: string): boolean {
  try {
    statSync(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Ported from `AudioTagService.RemoveAllTags(string path)`'s body -- kept
 * as a free function using TagLib.File directly (matching the C# source,
 * which calls `TagLib.File.Create`/`RemoveTags`/`Save` directly rather than
 * going through `AudioTag`).
 */
function removeAllTagsFromFile(path: string, logger: AudioTagServiceLogger): void {
  let file: TagLibFile | undefined;
  try {
    file = TagLibFile.createFromPath(path);
    file.removeTags(TagTypes.AllTags);
    file.save();
  } catch (ex) {
    if (ex instanceof CorruptFileError) {
      logger.warn(`Tag removal failed for ${path}.  File is corrupt`, ex);
    } else {
      logger.warn(`Tag removal failed for ${path}`, ex);
    }
  } finally {
    file?.dispose();
  }
}

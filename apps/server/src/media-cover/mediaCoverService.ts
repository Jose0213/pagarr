import { join } from "node:path";
import type { Author, Book, MediaCoverImage } from "../books/index.js";
import {
  AuthorDeletedEvent,
  AuthorRefreshCompleteEvent,
  BookDeletedEvent,
} from "../books/index.js";
import type { IHttpClient } from "../http/HttpClient.js";
import { HttpRequest } from "../http/HttpRequest.js";
import { HttpException } from "../http/HttpException.js";
import type { IEventAggregator, IHandleAsync } from "../messaging/index.js";
import { MediaCoverTypes, MediaCoverEntity } from "./mediaCover.js";
import type { ICoverExistsSpecification } from "./coverAlreadyExistsSpecification.js";
import type { IImageResizer } from "./imageResizer.js";
import { MediaCoversUpdatedEvent } from "./mediaCoversUpdatedEvent.js";
import type { IMediaCoverProxy } from "./mediaCoverProxy.js";

/**
 * Ported from NzbDrone.Core/MediaCover/MediaCoverService.cs.
 *
 * DEVIATIONS from the C# source:
 *
 *  - `IAppFolderInfo appFolderInfo` / `appFolderInfo.GetMediaCoverPath()`
 *    (NzbDrone.Common/Extensions/PathExtensions.cs's `Path.Combine(
 *    GetAppDataPath(appFolderInfo), "MediaCover")`): `IAppFolderInfo` isn't
 *    ported anywhere in this repo yet (verified: no AppFolderInfo/
 *    appFolderInfo references outside this file's own module). Same
 *    precedent as `instrumentation/deleteLogFilesService.ts`'s documented
 *    deviation for the identical situation -- the resolved folder path is
 *    passed in directly (`coverRootFolder: string`) rather than blocking
 *    this service on porting the whole app-data-directory-layout module.
 *  - `IDiskProvider`: narrowed to the slice this service actually calls
 *    (`FileExists`, `FileGetLastWrite`, `GetFileSize`, `FileSetLastWriteTime`,
 *    `FolderExists`, `DeleteFolder`) -- same "narrow IDiskProvider
 *    per-module" pattern as `download-clients/IDiskProviderLike.ts`.
 *    `ICoverExistsSpecification` (this module's own file) narrows the same
 *    interface separately for its own needs, per that same convention.
 *  - `IHttpClient.DownloadFile`/`Get`: uses the real, already-ported
 *    `http/HttpClient.ts` directly (not a forward-reference) -- this
 *    module's task brief calls out MediaCover as needing the real HTTP
 *    client, which already exists in this repo.
 *  - `SemaphoreSlim _semaphore` (concurrency limiter sized to `
 *    Ceiling(ProcessorCount / 2.0)`, guarding `EnsureResizedCovers` calls
 *    -- "ImageSharp is slow on ARM (no hardware acceleration on mono
 *    yet)"): `sharp` (libvips-backed) has no equivalent ARM/mono
 *    performance concern in Node, and Node's resize calls here are already
 *    fully serialized within a single `ensureAuthorCovers` call (the loop
 *    `await`s each resize in turn, see `ensureResizedCovers` below) -- so
 *    the semaphore's actual effect (bounding concurrent CPU-heavy resize
 *    work) has no meaningful analogue to preserve in a single-threaded
 *    event loop processing one author's covers at a time. Not ported;
 *    noted as an intentional behavioral simplification specific to the
 *    concurrency-primitive, not a functional gap (every image is still
 *    resized, in the same order, synchronously-within-await).
 *  - No NLog `Logger`: `_logger.Warn`/`_logger.Error`/`_logger.Info`/
 *    `_logger.Debug` calls become optional `warn`/`error`/`info`/`debug`
 *    callbacks on an injected logger object, matching this port's
 *    established no-NLog-yet convention (see `config/configService.ts`'s
 *    doc comment). Every call site and the exact message/args shape is
 *    preserved so a real logger can be wired in later without re-deriving
 *    what should be logged where.
 *  - `EnsureAuthorCovers`/`EnsureBookCovers`/`DownloadCover`/
 *    `DownloadBookCover`/`EnsureResizedCovers`/`GetServerHeaders` are all
 *    `async` here (HTTP + resize are Promise-based in this port) where the
 *    C# originals are synchronous -- matching this port's established
 *    "sync C# I/O becomes async TS I/O" convention used throughout
 *    already-ported HTTP-calling services.
 *  - `GetContentLength`: C#'s `HttpHeader.Get("content-range")` reads via
 *    the NameValueCollection indexer (comma-joins multi-values); this
 *    port's `HttpHeader.get()` does the same (see `http/HttpHeader.ts`),
 *    so the port uses that directly.
 *  - Three `IHandleAsync<T>` implementations, one method: C#'s
 *    `MediaCoverService` implements `IHandleAsync<AuthorRefreshCompleteEvent>`,
 *    `IHandleAsync<AuthorDeletedEvent>`, `IHandleAsync<BookDeletedEvent>` as
 *    three separately-overloaded `HandleAsync` methods (the DI container
 *    registers all three against the same instance, and the real
 *    `EventAggregator` dispatches each published event to whichever
 *    overload matches its runtime type). TS can't overload a method name
 *    this way, so this class has a single `handleAsync(message: ... |
 *    ... | ...)` that branches on `instanceof` -- see that method's own
 *    doc comment. A caller wiring this into the real `messaging/`
 *    `EventAggregator` registers the *same* `MediaCoverService` instance
 *    three times, once per event type: `eventAggregator.subscribeAsync(
 *    AuthorRefreshCompleteEvent, service)`, `subscribeAsync(
 *    AuthorDeletedEvent, service)`, `subscribeAsync(BookDeletedEvent,
 *    service)` -- each call is legal because `handleAsync`'s union
 *    parameter type structurally satisfies `IHandleAsync<T>` for any of
 *    the three individually.
 *  - `MediaCoverImage.extension` (books/models.ts): this module's task
 *    also required an ADDITIVE fix to `books/models.ts`'s
 *    `MediaCoverImage` interface, which was missing the real `MediaCover.
 *    Extension` field entirely (see that file's updated doc comment). The
 *    real C# `Extension` is "sticky": set once from the *original* remote
 *    URL the first time `Url` is assigned, and never recomputed after --
 *    this matters because `ConvertToLocalUrls` (RefreshBookService, not in
 *    this module's scope) rewrites `.Url` to a local path *before*
 *    `EnsureAuthorCovers`/`EnsureBookCovers` ever see the cover (they run
 *    off `AuthorRefreshCompleteEvent`, published after refresh + convert
 *    have already happened), so re-deriving "extension" from the
 *    (by-then-local) `.Url` at that point would be wrong. `extensionOf()`
 *    below reproduces the sticky behavior: read `cover.extension` if
 *    already set, otherwise derive it from `cover.url` once and cache it
 *    on the object (mirroring the real setter's `if (Extension.
 *    IsNullOrWhiteSpace()) Extension = Path.GetExtension(value);` guard).
 */

export interface MediaCoverServiceDiskProviderLike {
  fileExists(path: string): boolean;
  getFileSize(path: string): number;
  /** Milliseconds since epoch. See `media-cover/coverAlreadyExistsSpecification.ts`'s `CoverExistsDiskProviderLike` doc comment for why this port uses epoch-ms instead of .NET `DateTime`/`Ticks`. */
  fileGetLastWrite(path: string): number;
  fileSetLastWriteTime(path: string, date: Date): void;
  folderExists(path: string): boolean;
  deleteFolder(path: string, recursive: boolean): void;
}

export interface BookServiceLike {
  getBooksByAuthor(authorId: number): Book[];
}

/** Narrowed slice of `IConfigFileProvider` this service calls -- see `config/configFileProvider.ts`'s real `ConfigFileProvider.urlBase` getter. */
export interface MediaCoverServiceUrlBaseProvider {
  readonly urlBase: string;
}

export interface MediaCoverServiceLogger {
  warn?(message: string, ...args: unknown[]): void;
  error?(errorOrMessage: unknown, message?: string, ...args: unknown[]): void;
  /** Ported from NLog's `Logger.Debug(Exception, string, params object[])` overload -- both call sites (`downloadCover`/`downloadBookCover`) log the caught exception first, same shape as `error` above. */
  debug?(messageOrError: unknown, message?: string, ...args: unknown[]): void;
  info?(message: string, ...args: unknown[]): void;
}

const noopLogger: Required<MediaCoverServiceLogger> = {
  warn: () => {},
  error: () => {},
  debug: () => {},
  info: () => {},
};

/**
 * Ported from `MediaCoverService.USER_AGENT`: a mobile-app user agent
 * string used to work around some metadata-source hosts (e.g. Goodreads)
 * blocking obvious server/bot user agents on cover-image requests.
 */
const USER_AGENT = "Dalvik/2.1.0 (Linux; U; Android 10; SM-G975U Build/QP1A.190711.020)";

export interface IMapCoversToLocal {
  convertToLocalUrls(
    entityId: number,
    coverEntity: MediaCoverEntity,
    covers: Iterable<MediaCoverImage>
  ): void;
  getCoverPath(
    entityId: number,
    coverEntity: MediaCoverEntity,
    coverType: MediaCoverTypes,
    extension: string | null | undefined,
    height?: number | null
  ): string;
  ensureBookCovers(book: Book): Promise<void>;
}

export class MediaCoverService
  implements
    IMapCoversToLocal,
    IHandleAsync<AuthorRefreshCompleteEvent>,
    IHandleAsync<AuthorDeletedEvent>,
    IHandleAsync<BookDeletedEvent>
{
  private readonly logger: Required<MediaCoverServiceLogger>;
  private readonly coverRootFolder: string;

  constructor(
    private readonly mediaCoverProxy: Pick<IMediaCoverProxy, "registerUrl">,
    private readonly resizer: IImageResizer,
    private readonly bookService: BookServiceLike,
    private readonly httpClient: IHttpClient,
    private readonly diskProvider: MediaCoverServiceDiskProviderLike,
    /** Ported from `appFolderInfo.GetMediaCoverPath()` -- see class doc comment on the `IAppFolderInfo` deviation. */
    coverRootFolder: string,
    private readonly coverExistsSpecification: ICoverExistsSpecification,
    private readonly configFileProvider: MediaCoverServiceUrlBaseProvider,
    private readonly eventAggregator: IEventAggregator,
    logger: MediaCoverServiceLogger = {}
  ) {
    this.coverRootFolder = coverRootFolder;
    this.logger = { ...noopLogger, ...logger };
  }

  /** Ported from `MediaCoverService.GetCoverPath`. */
  getCoverPath(
    entityId: number,
    coverEntity: MediaCoverEntity,
    coverType: MediaCoverTypes,
    extension: string | null | undefined,
    height: number | null = null
  ): string {
    const heightSuffix = height !== null && height !== undefined ? "-" + String(height) : "";
    const baseName =
      coverTypeName(coverType) + heightSuffix + this.getExtension(coverType, extension);

    if (coverEntity === MediaCoverEntity.Book) {
      return join(this.getBookCoverPath(entityId), baseName);
    }

    return join(this.getAuthorCoverPath(entityId), baseName);
  }

  /** Ported from `MediaCoverService.ConvertToLocalUrls`. */
  convertToLocalUrls(
    entityId: number,
    coverEntity: MediaCoverEntity,
    covers: Iterable<MediaCoverImage>
  ): void {
    if (entityId === 0) {
      // Author isn't in Readarr yet, map via a proxy to circumvent referrer issues
      for (const mediaCover of covers) {
        mediaCover.remoteUrl = mediaCover.url;
        mediaCover.url = this.mediaCoverProxy.registerUrl(mediaCover.remoteUrl) ?? mediaCover.url;
      }

      return;
    }

    for (const mediaCover of covers) {
      const coverType = coverTypeFromString(mediaCover.coverType);

      if (coverType === MediaCoverTypes.Unknown) {
        continue;
      }

      const extension = extensionOf(mediaCover);
      const filePath = this.getCoverPath(entityId, coverEntity, coverType, extension, null);

      mediaCover.remoteUrl = mediaCover.url;

      if (coverEntity === MediaCoverEntity.Book) {
        mediaCover.url =
          this.configFileProvider.urlBase +
          "/MediaCover/Books/" +
          String(entityId) +
          "/" +
          coverTypeName(coverType) +
          this.getExtension(coverType, extension);
      } else {
        mediaCover.url =
          this.configFileProvider.urlBase +
          "/MediaCover/" +
          String(entityId) +
          "/" +
          coverTypeName(coverType) +
          this.getExtension(coverType, extension);
      }

      if (this.diskProvider.fileExists(filePath)) {
        const lastWrite = this.diskProvider.fileGetLastWrite(filePath);
        mediaCover.url += "?lastWrite=" + String(lastWrite);
      }
    }
  }

  private getAuthorCoverPath(authorId: number): string {
    return join(this.coverRootFolder, String(authorId));
  }

  private getBookCoverPath(bookId: number): string {
    return join(this.coverRootFolder, "Books", String(bookId));
  }

  /** Ported from `MediaCoverService.EnsureAuthorCovers`. */
  private async ensureAuthorCovers(author: Author): Promise<void> {
    const toResize: Array<{ cover: MediaCoverImage; alreadyExists: boolean }> = [];

    for (const cover of author.metadata?.images ?? []) {
      const coverType = coverTypeFromString(cover.coverType);

      if (coverType === MediaCoverTypes.Unknown) {
        continue;
      }

      const fileName = this.getCoverPath(
        author.id,
        MediaCoverEntity.Author,
        coverType,
        extensionOf(cover)
      );
      let alreadyExists = false;

      try {
        const serverFileHeaders = await this.getServerHeaders(cover.url);

        alreadyExists = this.coverExistsSpecification.alreadyExists(
          serverFileHeaders.lastModified,
          serverFileHeaders.contentLength,
          fileName
        );

        if (!alreadyExists) {
          await this.downloadCover(author, cover, serverFileHeaders.lastModified ?? new Date());
        }
      } catch (e) {
        if (e instanceof HttpException) {
          this.logger.warn(
            "Couldn't download media cover for {0}. {1}",
            author,
            (e as Error).message
          );
        } else {
          this.logger.error(e, "Couldn't download media cover for {0}", author);
        }
      }

      toResize.push({ cover, alreadyExists });
    }

    for (const { cover, alreadyExists } of toResize) {
      await this.ensureResizedCovers(author, cover, !alreadyExists);
    }
  }

  /** Ported from `MediaCoverService.EnsureBookCovers`. */
  async ensureBookCovers(book: Book): Promise<void> {
    const monitoredEdition = (book.editions ?? []).find((e) => e.monitored);

    for (const cover of monitoredEdition?.images ?? []) {
      const coverType = coverTypeFromString(cover.coverType);

      if (coverType !== MediaCoverTypes.Cover) {
        continue;
      }

      const fileName = this.getCoverPath(
        book.id,
        MediaCoverEntity.Book,
        coverType,
        extensionOf(cover),
        null
      );

      try {
        const serverFileHeaders = await this.getServerHeaders(cover.url);

        const alreadyExists = this.coverExistsSpecification.alreadyExists(
          serverFileHeaders.lastModified,
          serverFileHeaders.contentLength,
          fileName
        );

        if (!alreadyExists) {
          await this.downloadBookCover(book, cover, serverFileHeaders.lastModified ?? new Date());
        }
      } catch (e) {
        if (e instanceof HttpException) {
          this.logger.warn(
            "Couldn't download media cover for {0}. {1}",
            book,
            (e as Error).message
          );
        } else {
          this.logger.error(e, "Couldn't download media cover for {0}", book);
        }
      }
    }
  }

  private async downloadCover(
    author: Author,
    cover: MediaCoverImage,
    lastModified: Date
  ): Promise<void> {
    const coverType = coverTypeFromString(cover.coverType);
    const fileName = this.getCoverPath(
      author.id,
      MediaCoverEntity.Author,
      coverType,
      extensionOf(cover)
    );

    this.logger.info("Downloading {0} for {1} {2}", cover.coverType, author, cover.url);
    await this.httpClient.downloadFile(cover.url, fileName);

    try {
      this.diskProvider.fileSetLastWriteTime(fileName, lastModified);
    } catch (ex) {
      this.logger.debug(
        ex,
        "Unable to set modified date for {0} image for author {1}",
        cover.coverType,
        author
      );
    }
  }

  private async downloadBookCover(
    book: Book,
    cover: MediaCoverImage,
    lastModified: Date
  ): Promise<void> {
    const coverType = coverTypeFromString(cover.coverType);
    const fileName = this.getCoverPath(
      book.id,
      MediaCoverEntity.Book,
      coverType,
      extensionOf(cover),
      null
    );

    this.logger.info("Downloading {0} for {1} {2}", cover.coverType, book, cover.url);
    await this.httpClient.downloadFile(cover.url, fileName);

    try {
      this.diskProvider.fileSetLastWriteTime(fileName, lastModified);
    } catch (ex) {
      this.logger.debug(
        ex,
        "Unable to set modified date for {0} image for book {1}",
        cover.coverType,
        book
      );
    }
  }

  /** Ported from `MediaCoverService.EnsureResizedCovers`. `book` parameter dropped -- the C# source declares it (`Book book = null`) but never reads it anywhere in the method body (dead parameter). */
  private async ensureResizedCovers(
    author: Author,
    cover: MediaCoverImage,
    forceResize: boolean
  ): Promise<void> {
    const coverType = coverTypeFromString(cover.coverType);
    const heights = this.getDefaultHeights(coverType);
    const extension = extensionOf(cover);

    for (const height of heights) {
      const mainFileName = this.getCoverPath(
        author.id,
        MediaCoverEntity.Author,
        coverType,
        extension
      );
      const resizeFileName = this.getCoverPath(
        author.id,
        MediaCoverEntity.Author,
        coverType,
        extension,
        height
      );

      if (
        forceResize ||
        !this.diskProvider.fileExists(resizeFileName) ||
        this.diskProvider.getFileSize(resizeFileName) === 0
      ) {
        this.logger.debug("Resizing {0}-{1} for {2}", cover.coverType, height, author);

        try {
          await this.resizer.resize(mainFileName, resizeFileName, height);
        } catch {
          this.logger.debug(
            "Couldn't resize media cover {0}-{1} for author {2}, using full size image instead.",
            cover.coverType,
            height,
            author
          );
        }
      }
    }
  }

  /** Ported from `MediaCoverService.GetDefaultHeights`. */
  private getDefaultHeights(coverType: MediaCoverTypes): number[] {
    switch (coverType) {
      case MediaCoverTypes.Poster:
      case MediaCoverTypes.Disc:
      case MediaCoverTypes.Cover:
      case MediaCoverTypes.Logo:
      case MediaCoverTypes.Headshot:
        return [500, 250];

      case MediaCoverTypes.Banner:
        return [70, 35];

      case MediaCoverTypes.Fanart:
      case MediaCoverTypes.Screenshot:
        return [360, 180];

      default:
        return [];
    }
  }

  /** Ported from `MediaCoverService.GetExtension`. */
  private getExtension(
    coverType: MediaCoverTypes,
    defaultExtension: string | null | undefined
  ): string {
    if (coverType === MediaCoverTypes.Clearlogo) {
      return ".png";
    }

    return defaultExtension ?? "";
  }

  /** Ported from `MediaCoverService.GetServerHeaders`: HEAD-equivalent probe via a zero-byte Range request (Goodreads doesn't allow real HEAD requests). */
  private async getServerHeaders(
    url: string
  ): Promise<{ lastModified: Date | null; contentLength: number | null }> {
    const request = new HttpRequest(url);
    request.allowAutoRedirect = true;

    request.headers.add("Range", "bytes=0-0");
    request.headers.add("User-Agent", USER_AGENT);

    const response = await this.httpClient.get(request);

    return {
      lastModified: response.headers.lastModified,
      contentLength: this.getContentLength(response.headers),
    };
  }

  /** Ported from `MediaCoverService.GetContentLength`: parses the `n/total` form of a Content-Range response header. */
  private getContentLength(headers: { get(key: string): string | null }): number | null {
    const range = headers.get("content-range");

    if (range === null) {
      return null;
    }

    const split = range.split("/");
    if (split.length === 2) {
      const length = Number.parseInt(split[1]!, 10);
      if (!Number.isNaN(length) && String(length) === split[1]) {
        return length;
      }
    }

    return null;
  }

  /** Ported from `MediaCoverService.HandleAsync(AuthorRefreshCompleteEvent message)`. Also serves as the `IHandleAsync<AuthorDeletedEvent>`/`IHandleAsync<BookDeletedEvent>` implementation -- see class doc comment; C# distinguishes these three via method overloading, dispatched by the messaging bus on the message's runtime type, which this single method reproduces via `instanceof`. */
  async handleAsync(
    message: AuthorRefreshCompleteEvent | AuthorDeletedEvent | BookDeletedEvent
  ): Promise<void> {
    if (message instanceof AuthorRefreshCompleteEvent) {
      await this.ensureAuthorCovers(message.author);

      const books = this.bookService.getBooksByAuthor(message.author.id);
      for (const book of books) {
        await this.ensureBookCovers(book);
      }

      this.eventAggregator.publishEvent(MediaCoversUpdatedEvent.forAuthor(message.author));
      return;
    }

    if (message instanceof AuthorDeletedEvent) {
      const path = this.getAuthorCoverPath(message.author.id);
      if (this.diskProvider.folderExists(path)) {
        this.diskProvider.deleteFolder(path, true);
      }
      return;
    }

    // BookDeletedEvent
    const path = this.getBookCoverPath(message.book.id);
    if (this.diskProvider.folderExists(path)) {
      this.diskProvider.deleteFolder(path, true);
    }
  }
}

/**
 * `MediaCoverImage.coverType` (`books/models.ts`) is stored as a `string`
 * (the JSON-embedded shape doesn't carry the real `MediaCoverTypes` enum --
 * see that file's doc comment on why `MediaCover`/`MediaCoverTypes` aren't
 * imported into `books/models.ts` directly). This maps the stored string
 * back to the enum the same way C#'s JSON deserializer would resolve
 * `MediaCoverTypes` by member name; unrecognized/missing values fall back
 * to `Unknown`, matching the enum's own `Unknown = 0` default.
 */
function coverTypeFromString(value: string | null | undefined): MediaCoverTypes {
  if (!value) {
    return MediaCoverTypes.Unknown;
  }

  const key = Object.keys(MediaCoverTypes).find(
    (k) => Number.isNaN(Number(k)) && k.toLowerCase() === value.toLowerCase()
  );

  return key ? MediaCoverTypes[key as keyof typeof MediaCoverTypes] : MediaCoverTypes.Unknown;
}

/** Ported from `coverType.ToString().ToLower()`, used throughout the C# source to build file/URL path segments (e.g. "poster", "banner"). */
function coverTypeName(coverType: MediaCoverTypes): string {
  return MediaCoverTypes[coverType].toLowerCase();
}

/**
 * Ported from reading `MediaCover.Extension` -- see class doc comment on
 * the sticky-extension deviation. Reads the already-set `extension` field
 * if present; otherwise derives it from the current `url` (matching
 * `Path.GetExtension`) and caches it on the object, exactly mirroring the
 * real `MediaCover.Url` setter's `if (Extension.IsNullOrWhiteSpace())
 * Extension = Path.GetExtension(value);` guard.
 */
function extensionOf(cover: MediaCoverImage): string {
  if (cover.extension !== undefined && cover.extension !== null && cover.extension.trim() !== "") {
    return cover.extension;
  }

  const derived = getPathExtension(cover.url);
  cover.extension = derived;
  return derived;
}

/** Ported from `Path.GetExtension(string path)` -- same local port as `media-cover/mediaCover.ts`'s `getPathExtension`. */
function getPathExtension(path: string): string {
  const lastSlash = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  const lastDot = path.lastIndexOf(".");

  if (lastDot <= lastSlash || lastDot === -1) {
    return "";
  }

  return path.slice(lastDot);
}

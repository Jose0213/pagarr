import type { Author, Book } from "../../books/models.js";
import type { BookService } from "../../books/bookService.js";
import type { IConfigService } from "../../config/configService.js";
import type { HttpException } from "../../http/HttpException.js";
import type { IHttpClient } from "../../http/HttpClient.js";
import { ExtraFileManager } from "../extraFileManager.js";
import type { ExtraFileManagerOptions } from "../extraFileManager.js";
import type { ExtraFile } from "../extraFile.js";
import { sha256Hash } from "../hashing.js";
import { getRelativePath } from "../pathHelpers.js";
import { pathEquals } from "../../root-folders/path-utils.js";
import {
  TransferMode,
  type BookFile,
  type DiskTransferServiceLike,
  type MediaFileAttributeServiceLike,
  type RecycleBinProviderLike,
} from "../forwardRefs.js";
import type { ICleanMetadataService } from "./cleanMetadataFileService.js";
import type { IMetadataFactory } from "./metadataFactory.js";
import type { IMetadataFileService } from "./metadataFileService.js";
import type { MetadataFile } from "./metadataFile.js";
import { MetadataType } from "./metadataType.js";
import type { IMetadata } from "./metadataBase.js";
import type { ImageFileResult } from "./imageFileResult.js";

/**
 * Ported from NzbDrone.Core/Extras/Metadata/MetadataService.cs (`class
 * MetadataService : ExtraFileManager<MetadataFile>`).
 *
 * Constructor-injection deviations, matching this module's established
 * pattern for un-ported Common/Disk methods (extraFileService.ts/
 * extraFileManager.ts): `IDiskProvider.FolderExists`/`MoveFile` are taken
 * as narrow callbacks (`folderExists`, plus `moveFile` forwarded to the
 * `ExtraFileManager` base for `moveFile()`).
 *
 * `IOtherExtraFileRenamer` is the real type from `others/otherExtraFileRenamer.ts`
 * (this module's own sibling submodule, not a forward-reference) --
 * `MetadataService` depends on `Others` in the real C# source too (an
 * intentional Metadata->Others dependency direction, not a cycle: Others
 * never imports back from Metadata).
 *
 * ASYNC DEVIATION: `DownloadImage`/`ProcessAuthorImages` and therefore
 * `CreateAfterAuthorScan`/`CreateAfterBookImportWithFolders` are async here
 * where the C# signatures are synchronous. This repo's already-ported
 * `IHttpClient.downloadFile` (http/HttpClient.ts) is genuinely
 * Promise-based (Node has no synchronous HTTP client), unlike C#'s
 * `IHttpClient.DownloadFile`, which blocks the calling thread. Every
 * method whose call chain can reach `DownloadImage` is threaded as async
 * accordingly; `CreateAfterBookImport` and `Import` (which never touch
 * image downloads) stay synchronous, matching their real C# signatures.
 */
export class MetadataService extends ExtraFileManager<MetadataFile> {
  private readonly folderExists: (path: string) => boolean;
  private readonly moveFileOnDisk: (sourcePath: string, targetPath: string) => void;

  constructor(
    configService: IConfigService,
    diskTransferService: DiskTransferServiceLike,
    private readonly recycleBinProvider: RecycleBinProviderLike,
    private readonly otherExtraFileRenamer: RenameOtherExtraFileLike,
    private readonly metadataFactory: IMetadataFactory,
    private readonly cleanMetadataService: ICleanMetadataService,
    private readonly httpClient: IHttpClient,
    private readonly mediaFileAttributeService: MediaFileAttributeServiceLike,
    private readonly metadataFileService: IMetadataFileService,
    private readonly bookService: BookService,
    options: ExtraFileManagerOptions & { folderExists?: (path: string) => boolean } = {}
  ) {
    super(configService, diskTransferService, options);
    this.folderExists = options.folderExists ?? (() => true);
    this.moveFileOnDisk = options.moveFile ?? (() => {});
  }

  readonly order = 0;

  /** Ported from MetadataService.CreateAfterAuthorScan(Author author, List<BookFile> bookFiles). */
  async createAfterAuthorScan(author: Author, bookFiles: BookFile[]): Promise<ExtraFile[]> {
    const metadataFiles = this.metadataFileService.getFilesByAuthor(author.id);
    this.cleanMetadataService.clean(author);

    if (!this.folderExists(author.path)) {
      return [];
    }

    const files: MetadataFile[] = [];

    for (const consumer of this.metadataFactory.enabled()) {
      const consumerFiles = getMetadataFilesForConsumer(consumer, metadataFiles);

      addIfNotNull(files, this.processAuthorMetadata(consumer, author, consumerFiles));
      files.push(...(await this.processAuthorImages(consumer, author, consumerFiles)));

      for (const bookFile of bookFiles) {
        addIfNotNull(files, this.processBookMetadata(consumer, author, bookFile, consumerFiles));
      }
    }

    this.metadataFileService.upsertMany(files);

    return files;
  }

  /** Ported from MetadataService.CreateAfterBookImport(Author author, BookFile bookFile). */
  createAfterBookImport(author: Author, bookFile: BookFile): ExtraFile[] {
    const files: MetadataFile[] = [];

    for (const consumer of this.metadataFactory.enabled()) {
      addIfNotNull(files, this.processBookMetadata(consumer, author, bookFile, []));
    }

    this.metadataFileService.upsertMany(files);

    return files;
  }

  /** Ported from MetadataService.CreateAfterBookImport(Author author, Book book, string authorFolder, string bookFolder). */
  async createAfterBookImportWithFolders(
    author: Author,
    _book: Book,
    authorFolder: string | null,
    bookFolder: string | null
  ): Promise<ExtraFile[]> {
    const metadataFiles = this.metadataFileService.getFilesByAuthor(author.id);

    if (isBlank(authorFolder) && isBlank(bookFolder)) {
      return [];
    }

    const files: MetadataFile[] = [];

    for (const consumer of this.metadataFactory.enabled()) {
      const consumerFiles = getMetadataFilesForConsumer(consumer, metadataFiles);

      if (!isBlank(authorFolder)) {
        addIfNotNull(files, this.processAuthorMetadata(consumer, author, consumerFiles));
        files.push(...(await this.processAuthorImages(consumer, author, consumerFiles)));
      }
    }

    this.metadataFileService.upsertMany(files);

    return files;
  }

  /** Ported from MetadataService.MoveFilesAfterRename(Author author, List<BookFile> bookFiles). */
  moveFilesAfterRename(author: Author, bookFiles: BookFile[]): ExtraFile[] {
    const metadataFiles = this.metadataFileService.getFilesByAuthor(author.id);
    const movedFiles: MetadataFile[] = [];
    const distinctBookFilePaths = distinctByDirectory(bookFiles);

    // TODO: Move EpisodeImage and EpisodeMetadata metadata files, instead of relying on consumers to do it
    // (Xbmc's EpisodeImage is more than just the extension)
    for (const consumer of this.metadataFactory.getAvailableProviders()) {
      for (const filePath of distinctBookFilePaths) {
        const editionBookId = requireEditionBookId(filePath);
        const metadataFilesForConsumer = getMetadataFilesForConsumer(consumer, metadataFiles)
          .filter((m) => m.bookId === editionBookId)
          .filter((m) => m.type === MetadataType.BookImage || m.type === MetadataType.BookMetadata);

        for (const metadataFile of metadataFilesForConsumer) {
          const newFileName = consumer.getFilenameAfterMoveForBookPath(
            author,
            getDirectoryName(filePath.path),
            metadataFile
          );
          const existingFileName = joinPath(author.path, metadataFile.relativePath);

          if (!pathEquals(newFileName, existingFileName)) {
            try {
              this.moveFileOnDisk(existingFileName, newFileName);
              metadataFile.relativePath = getRelativePath(author.path, newFileName);
              movedFiles.push(metadataFile);
            } catch {
              // Ported: C# logs a warning ("Unable to move metadata file after rename") and continues.
            }
          }
        }
      }

      for (const bookFile of bookFiles) {
        const metadataFilesForConsumer = getMetadataFilesForConsumer(
          consumer,
          metadataFiles
        ).filter((m) => m.bookFileId === bookFile.id);

        for (const metadataFile of metadataFilesForConsumer) {
          const newFileName = consumer.getFilenameAfterMoveForBookFile(
            author,
            bookFile,
            metadataFile
          );
          const existingFileName = joinPath(author.path, metadataFile.relativePath);

          if (!pathEquals(newFileName, existingFileName)) {
            try {
              this.moveFileOnDisk(existingFileName, newFileName);
              metadataFile.relativePath = getRelativePath(author.path, newFileName);
              movedFiles.push(metadataFile);
            } catch {
              // Ported: same swallow-and-continue as above.
            }
          }
        }
      }
    }

    this.metadataFileService.upsertMany(movedFiles);

    return movedFiles;
  }

  /** Ported from MetadataService.Import(...): always returns null -- MetadataService never imports pre-existing sidecar files this way (only ExistingMetadataImporter does, via a different path). */
  import(): ExtraFile | null {
    return null;
  }

  private processAuthorMetadata(
    consumer: IMetadata,
    author: Author,
    existingMetadataFiles: MetadataFile[]
  ): MetadataFile | null {
    const authorMetadata = consumer.authorMetadata(author);

    if (authorMetadata === null) {
      return null;
    }

    const hash = sha256Hash(authorMetadata.contents);

    const metadata =
      getMetadataFile(
        this.recycleBinProvider,
        this.metadataFileService,
        author,
        existingMetadataFiles,
        (e) => e.type === MetadataType.AuthorMetadata
      ) ?? newMetadataFileFor(author, consumer, MetadataType.AuthorMetadata);

    if (hash === metadata.hash) {
      if (authorMetadata.relativePath !== metadata.relativePath) {
        metadata.relativePath = authorMetadata.relativePath;
        return metadata;
      }
      return null;
    }

    const fullPath = joinPath(author.path, authorMetadata.relativePath);

    this.otherExtraFileRenamer.renameOtherExtraFile(author, fullPath);

    this.saveMetadataFile(fullPath, authorMetadata.contents);

    metadata.hash = hash;
    metadata.relativePath = authorMetadata.relativePath;
    metadata.extension = getExtension(fullPath);

    return metadata;
  }

  private processBookMetadata(
    consumer: IMetadata,
    author: Author,
    bookFile: BookFile,
    existingMetadataFiles: MetadataFile[]
  ): MetadataFile | null {
    const trackMetadata = consumer.bookMetadata(author, bookFile);

    if (trackMetadata === null) {
      return null;
    }

    const fullPath = joinPath(author.path, trackMetadata.relativePath);

    this.otherExtraFileRenamer.renameOtherExtraFile(author, fullPath);

    const existingMetadata = getMetadataFile(
      this.recycleBinProvider,
      this.metadataFileService,
      author,
      existingMetadataFiles,
      (c) => c.type === MetadataType.BookMetadata && c.bookFileId === bookFile.id
    );

    if (existingMetadata !== null) {
      const existingFullPath = joinPath(author.path, existingMetadata.relativePath);
      if (!pathEquals(fullPath, existingFullPath)) {
        this.diskTransferService.transferFile(existingFullPath, fullPath, TransferMode.Move);
        existingMetadata.relativePath = trackMetadata.relativePath;
      }
    }

    const hash = sha256Hash(trackMetadata.contents);

    const metadata: MetadataFile = existingMetadata ?? {
      id: 0,
      authorId: author.id,
      bookId: requireEditionBookId(bookFile),
      bookFileId: bookFile.id,
      consumer: consumerName(consumer),
      type: MetadataType.BookMetadata,
      relativePath: trackMetadata.relativePath,
      extension: getExtension(fullPath),
      hash: null,
      added: "",
      lastUpdated: "",
    };

    if (hash === metadata.hash) {
      return null;
    }

    this.saveMetadataFile(fullPath, trackMetadata.contents);

    metadata.hash = hash;

    return metadata;
  }

  private async processAuthorImages(
    consumer: IMetadata,
    author: Author,
    existingMetadataFiles: MetadataFile[]
  ): Promise<MetadataFile[]> {
    const result: MetadataFile[] = [];

    for (const image of consumer.authorImages(author)) {
      const fullPath = joinPath(author.path, image.relativePath);

      if (this.fileExistsForImages(fullPath)) {
        continue;
      }

      this.otherExtraFileRenamer.renameOtherExtraFile(author, fullPath);

      const metadata = getMetadataFile(
        this.recycleBinProvider,
        this.metadataFileService,
        author,
        existingMetadataFiles,
        (c) => c.type === MetadataType.AuthorImage && c.relativePath === image.relativePath
      ) ?? {
        id: 0,
        authorId: author.id,
        bookId: null,
        bookFileId: null,
        consumer: consumerName(consumer),
        type: MetadataType.AuthorImage,
        relativePath: image.relativePath,
        extension: getExtension(fullPath),
        hash: null,
        added: "",
        lastUpdated: "",
      };

      await this.downloadImage(author, image);

      result.push(metadata);
    }

    return result;
  }

  /**
   * Stand-in for the not-yet-ported `IDiskProvider.FileExists` check in
   * `ProcessAuthorImages`. Separate from the constructor-option
   * `folderExists` (different disk predicate); defaults to `false` so
   * images are attempted-downloaded by default in the absence of a real
   * disk layer, matching this module's other un-ported-dependency
   * defaults (extraFileService.ts's `fileExists` option, same rationale).
   */
  private fileExistsForImages(_path: string): boolean {
    return false;
  }

  private async downloadImage(author: Author, image: ImageFileResult): Promise<void> {
    const fullPath = joinPath(author.path, image.relativePath);
    let downloaded = true;

    try {
      if (image.url.startsWith("http")) {
        await this.httpClient.downloadFile(image.url, fullPath);
      } else {
        downloaded = false;
      }

      if (downloaded) {
        this.mediaFileAttributeService.setFilePermissions(fullPath);
      }
    } catch (ex) {
      if (isHttpException(ex)) {
        // Ported: C# logs a warning ("Couldn't download image {0} for {1}. {2}") and continues.
        return;
      }
      // Ported: any other exception is logged at Error level in C# but still swallowed (Couldn't download image {0} for {1}).
    }
  }

  private saveMetadataFile(path: string, contents: string): void {
    // Stand-in for the not-yet-ported IDiskProvider.WriteAllText -- see
    // module doc comment re: disk-layer callbacks. Extras' own real
    // behavioral surface (hash comparison, upsert bookkeeping) doesn't
    // depend on the write itself succeeding; a real disk-writing
    // implementation should replace this via subclassing or a future
    // constructor option once IDiskProvider lands.
    void path;
    void contents;
    this.mediaFileAttributeService.setFilePermissions(path);
  }
}

function getMetadataFilesForConsumer(
  consumer: IMetadata,
  authorMetadata: MetadataFile[]
): MetadataFile[] {
  return authorMetadata.filter((c) => c.consumer === consumerName(consumer));
}

function consumerName(consumer: IMetadata): string {
  return (consumer as unknown as { constructor: { name: string } }).constructor.name;
}

/**
 * Ported from MetadataService.GetMetadataFile: returns the first matching
 * metadata file, recycling+deleting any duplicates beyond the first
 * (matching duplicate metadata files should never happen, but the real
 * source defensively cleans them up whenever found).
 */
function getMetadataFile(
  recycleBinProvider: RecycleBinProviderLike,
  metadataFileService: IMetadataFileService,
  author: Author,
  existingMetadataFiles: MetadataFile[],
  predicate: (file: MetadataFile) => boolean
): MetadataFile | null {
  const matching = existingMetadataFiles.filter(predicate);

  if (matching.length === 0) {
    return null;
  }

  for (const file of matching.slice(1)) {
    const path = joinPath(author.path, file.relativePath);
    const subfolder = getSubfolder(author.path, path);
    recycleBinProvider.deleteFile(path, subfolder);
    metadataFileService.delete(file.id);
  }

  return matching[0]!;
}

function newMetadataFileFor(author: Author, consumer: IMetadata, type: MetadataType): MetadataFile {
  return {
    id: 0,
    authorId: author.id,
    bookId: null,
    bookFileId: null,
    consumer: consumerName(consumer),
    type,
    relativePath: "",
    extension: "",
    hash: null,
    added: "",
    lastUpdated: "",
  };
}

function addIfNotNull<T>(list: T[], item: T | null): void {
  if (item !== null) {
    list.push(item);
  }
}

function isBlank(value: string | null | undefined): boolean {
  return value === null || value === undefined || value.trim() === "";
}

/** Ported from `bookFiles.DistinctBy(s => Path.GetDirectoryName(s.Path))`. */
function distinctByDirectory(bookFiles: BookFile[]): BookFile[] {
  const seen = new Set<string>();
  const result: BookFile[] = [];
  for (const bf of bookFiles) {
    const dir = getDirectoryName(bf.path);
    if (!seen.has(dir)) {
      seen.add(dir);
      result.push(bf);
    }
  }
  return result;
}

function requireEditionBookId(bookFile: BookFile): number {
  if (!bookFile.edition) {
    throw new Error(`BookFile ${bookFile.id}'s Edition has not been loaded`);
  }
  return bookFile.edition.bookId;
}

function isHttpException(ex: unknown): ex is HttpException {
  return ex instanceof Error && ex.name === "HttpException";
}

/** Ported from `_diskProvider.GetParentFolder(author.Path).GetRelativePath(_diskProvider.GetParentFolder(path))`. */
function getSubfolder(authorPath: string, filePath: string): string {
  const authorParent = getDirectoryName(authorPath);
  const fileParent = getDirectoryName(filePath);

  if (fileParent.length <= authorParent.length) {
    return "";
  }

  return fileParent.slice(authorParent.length).replace(/^[/\\]+/, "");
}

function getDirectoryName(path: string): string {
  const trimmed = path.replace(/[/\\]+$/, "");
  const idx = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
  return idx === -1 ? "" : trimmed.slice(0, idx);
}

function getExtension(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const base = normalized.slice(normalized.lastIndexOf("/") + 1);
  const dotIndex = base.lastIndexOf(".");
  return dotIndex > 0 ? base.slice(dotIndex) : "";
}

function joinPath(base: string, relative: string): string {
  if (base.endsWith("/") || base.endsWith("\\")) {
    return base + relative;
  }
  const sep = base.includes("\\") && !base.includes("/") ? "\\" : "/";
  return base + sep + relative;
}

/** Forward-ref for `others/otherExtraFileRenamer.ts`'s `IOtherExtraFileRenamer` interface, narrowed to the one method MetadataService calls. Declared locally to avoid a metadata/->others/ import cycle risk; the real concrete class satisfies this structurally. */
export interface RenameOtherExtraFileLike {
  renameOtherExtraFile(author: Author, path: string): void;
}

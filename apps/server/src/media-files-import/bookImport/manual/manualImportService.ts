import { createHash } from "node:crypto";
import type { Author, Book } from "../../../books/index.js";
import { newLocalBook, type LocalBook } from "../../../parser/model/localBook.js";
import { newParsedTrackInfo } from "../../../parser/model/parsedTrackInfo.js";
import type { IProvideBookInfo } from "../../../metadata-source/interfaces.js";
import type { CustomFormatCalculationService } from "../../../custom-formats/customFormatCalculationService.js";
import type { FileInfoLike, IMediaFileDiskProvider } from "../../mediaFileDiskProvider.js";
import { FilterFilesType } from "../../filterFilesType.js";
import { ImportResultType } from "../../importResultType.js";
import { ImportDecision, Rejection } from "../importDecision.js";
import type { ImportResult } from "../importResult.js";
import type { IMakeImportDecision, ImportDecisionMakerInfo } from "../importDecisionMaker.js";
import type { IdentificationOverrides } from "../identification/candidateService.js";
import type { IImportApprovedBooks } from "../importApprovedBooks.js";
import type { IDownloadedBooksImportService } from "../../downloadedBooksImportService.js";
import { newManualImportItem, type ManualImportItem } from "./manualImportItem.js";
import type { ManualImportCommand } from "./manualImportCommand.js";
import type { IMediaFilesEventAggregator } from "../../events.js";
import {
  TrackedDownloadStateLike,
  type CompletedDownloadVerifier,
  type ImportItemProvider,
  type TrackedDownloadLookup,
  type TrackedDownloadLike,
} from "./trackedDownloadLike.js";
import type { DownloadClientItemLike } from "../importDecisionEngineSpecification.js";
import { parseBookTitle } from "../../../parser/parser.js";

/** Ported from the slice of `IAuthorService` this service reads. */
export interface ManualAuthorLookup {
  getAuthor(authorId: number): Author;
}

/** Ported from the slice of `IBookService` this service reads/writes. */
export interface ManualBookLookup {
  getBook(bookId: number): Book;
  updateBook(book: Book): Book;
}

/** Ported from the slice of `IEditionService` this service reads. */
export interface ManualEditionLookup {
  getEditionByForeignEditionId(
    foreignEditionId: string
  ): { id: number; foreignEditionId: string } | undefined;
}

/** Ported from the slice of `IMetadataTagService` this service calls -- see identificationService.ts's identical forward-reference. */
export interface ManualMetadataTagReaderLike {
  readTags(file: FileInfoLike): ReturnType<typeof newParsedTrackInfo>;
}

export interface IManualImportService {
  getMediaFiles(
    path: string,
    downloadId: string | null,
    author: Author | null,
    filter: FilterFilesType,
    replaceExistingFiles: boolean
  ): Promise<ManualImportItem[]>;
  updateItems(items: ManualImportItem[]): Promise<ManualImportItem[]>;
}

/**
 * Ported from NzbDrone.Core/MediaFiles/BookImport/Manual/ManualImportService.cs.
 *
 * `GetMediaFiles`/`ProcessFolder`/`UpdateItems`/`Execute` are all `async`
 * here because `IMakeImportDecision.getImportDecisions` (this module's
 * own, already-ported `importDecisionMaker.ts`) is Promise-based -- see
 * that file's doc comment for why (IdentificationService's remote-
 * candidate lookups are Promise-based). `UpdateItems` is synchronous in
 * the real C# source; this is this class's one real signature deviation
 * from the C# interface, forced by that same async ripple -- documented
 * here rather than silently diverging.
 *
 * `IExecute<ManualImportCommand>.Execute` (Messaging module, Phase 4) is
 * ported as a plain async method (`execute`) rather than a real command-
 * bus subscription -- same substitution as mediaFileService.ts's doc
 * comment on `IHandle<T>`.
 */
export class ManualImportService implements IManualImportService {
  constructor(
    private readonly diskProvider: IMediaFileDiskProvider,
    private readonly rootFolderService: { getBestRootFolder(path: string): unknown },
    /** Ported from the slice of `IParsingService` this service calls (`GetAuthor`) -- the real, already-ported `parser/parsingService.ts` satisfies this directly. */
    private readonly parsingService: { getAuthor(title: string): Author | undefined },
    private readonly importDecisionMaker: IMakeImportDecision,
    private readonly authorService: ManualAuthorLookup,
    private readonly bookService: ManualBookLookup,
    private readonly editionService: ManualEditionLookup,
    private readonly bookInfo: IProvideBookInfo,
    private readonly metadataTagService: ManualMetadataTagReaderLike,
    private readonly importApprovedBooks: IImportApprovedBooks,
    private readonly formatCalculator: CustomFormatCalculationService,
    private readonly trackedDownloadService: TrackedDownloadLookup,
    private readonly downloadedBooksImportService: IDownloadedBooksImportService,
    private readonly provideImportItemService: ImportItemProvider,
    private readonly eventAggregator: IMediaFilesEventAggregator,
    private readonly completedDownloadService?: CompletedDownloadVerifier
  ) {}

  async getMediaFiles(
    path: string,
    downloadId: string | null,
    author: Author | null,
    filter: FilterFilesType,
    replaceExistingFiles: boolean
  ): Promise<ManualImportItem[]> {
    let resolvedPath = path;

    if (downloadId !== null && downloadId.trim() !== "") {
      const trackedDownload = this.trackedDownloadService.find(downloadId);

      if (trackedDownload === undefined) {
        return [];
      }

      if (trackedDownload.importItem === undefined) {
        trackedDownload.importItem = this.provideImportItemService.provideImportItem(
          trackedDownload.downloadItem,
          trackedDownload.importItem
        );
      }

      resolvedPath = trackedDownload.importItem.outputPath.fullPath;
    }

    if (!this.diskProvider.folderExists(resolvedPath)) {
      if (!this.diskProvider.fileExists(resolvedPath)) {
        return [];
      }

      const files = [this.diskProvider.getFileInfo(resolvedPath)];

      const decisions = await this.importDecisionMaker.getImportDecisions(files, null, null, {
        filter: FilterFilesType.None,
        newDownload: true,
        singleRelease: false,
        includeExisting: !replaceExistingFiles,
        addNewAuthors: false,
        keepAllEditions: true,
      });

      const result = this.mapItem(decisions[0]!, downloadId, replaceExistingFiles, false);

      return [result];
    }

    return this.processFolder(resolvedPath, downloadId, author, filter, replaceExistingFiles);
  }

  private async processFolder(
    folder: string,
    downloadId: string | null,
    authorIn: Author | null,
    filter: FilterFilesType,
    replaceExistingFiles: boolean
  ): Promise<ManualImportItem[]> {
    let downloadClientItem: DownloadClientItemLike | null = null;
    const directoryInfo = this.diskProvider.getDirectoryInfo(folder);
    // Ported from `author = author ?? _parsingService.GetAuthor(directoryInfo.Name)`.
    let author = authorIn ?? this.parsingService.getAuthor(directoryInfo.name) ?? null;

    if (downloadId !== null && downloadId.trim() !== "") {
      const trackedDownload = this.trackedDownloadService.find(downloadId);
      downloadClientItem = trackedDownload?.downloadItem ?? null;

      if (author === null) {
        author = trackedDownload?.remoteBook?.author ?? null;
      }
    }

    const authorFiles = this.diskProvider
      .getFiles(folder, false)
      .map((p) => this.diskProvider.getFileInfo(p));
    const idOverrides: IdentificationOverrides = author !== null ? { author } : {};
    const itemInfo: ImportDecisionMakerInfo = {
      downloadClientItem,
      // Ported from `Parser.Parser.ParseBookTitle(directoryInfo.Name)`.
      parsedBookInfo: parseBookTitle(directoryInfo.name),
    };

    const decisions = await this.importDecisionMaker.getImportDecisions(
      authorFiles,
      idOverrides,
      itemInfo,
      {
        filter,
        newDownload: true,
        singleRelease: false,
        includeExisting: !replaceExistingFiles,
        addNewAuthors: false,
        keepAllEditions: true,
      }
    );

    // paths will be different for new and old files which is why we need to map separately
    const decisionByPath = new Map(decisions.map((d) => [d.item.path, d] as const));
    const newFiles = authorFiles.filter((f) => decisionByPath.has(f.fullName));

    const newItems = newFiles.map((f) =>
      this.mapItem(decisionByPath.get(f.fullName)!, downloadId, replaceExistingFiles, false)
    );
    const newFilePaths = new Set(newFiles.map((f) => f.fullName));
    const existingDecisions = decisions.filter((d) => !newFilePaths.has(d.item.path));
    const existingItems = existingDecisions.map((d) =>
      this.mapItem(d, null, replaceExistingFiles, false)
    );

    return [...newItems, ...existingItems];
  }

  /** Ported from `ManualImportService.UpdateItems(List<ManualImportItem> items)`. See this class's doc comment for why this is `async` where the C# signature is synchronous. */
  async updateItems(items: ManualImportItem[]): Promise<ManualImportItem[]> {
    const replaceExistingFiles = items.every((x) => x.replaceExistingFiles);
    const groupedItems = groupBy(
      items.filter((x) => !x.additionalFile),
      (x) => x.book?.id
    );

    const result: ManualImportItem[] = [];

    for (const group of groupedItems) {
      const disableReleaseSwitching = group[0]!.disableReleaseSwitching;

      const files = group.map((x) => this.diskProvider.getFileInfo(x.path));
      const idOverride: IdentificationOverrides = {
        author: group[0]!.author,
        book: group[0]!.book,
        edition: group[0]!.edition,
      };

      const decisions = await this.importDecisionMaker.getImportDecisions(files, idOverride, null, {
        filter: FilterFilesType.None,
        newDownload: true,
        singleRelease: true,
        includeExisting: !replaceExistingFiles,
        addNewAuthors: false,
      });

      const decisionByPath = new Map(decisions.map((d) => [d.item.path, d] as const));
      const existingItems = group
        .filter((i) => decisionByPath.has(i.path))
        .map((i) => ({ item: i, decision: decisionByPath.get(i.path)! }));

      for (const { item, decision } of existingItems) {
        if (decision.item.author !== null) {
          item.author = decision.item.author;
        }

        if (decision.item.book !== null) {
          item.book = decision.item.book ?? undefined;
          item.edition = decision.item.edition ?? undefined;
        }

        if (item.quality?.quality.id === 0) {
          item.quality = decision.item.quality ?? undefined;
        }

        if (item.releaseGroup === null || item.releaseGroup.trim() === "") {
          item.releaseGroup = decision.item.releaseGroup;
        }

        item.rejections = decision.rejections;
        item.size = decision.item.size;

        result.push(item);
      }

      const existingPaths = new Set(existingItems.map((x) => x.item.path));
      const newDecisions = decisions.filter((d) => !existingPaths.has(d.item.path));
      result.push(
        ...newDecisions.map((d) =>
          this.mapItem(d, null, replaceExistingFiles, disableReleaseSwitching)
        )
      );
    }

    return result;
  }

  private mapItem(
    decision: ImportDecision<LocalBook>,
    downloadId: string | null,
    replaceExistingFiles: boolean,
    disableReleaseSwitching: boolean
  ): ManualImportItem {
    const item = newManualImportItem();

    item.id = hashInt31(decision.item.path);
    item.path = decision.item.path;
    item.name = fileNameWithoutExtension(decision.item.path);
    item.downloadId = downloadId;

    if (decision.item.author !== null) {
      item.author = decision.item.author;
      item.customFormats = this.formatCalculator.parseCustomFormatForLocalBook({
        author: decision.item.author,
        sceneName: decision.item.sceneName,
        quality: decision.item.quality,
        releaseGroup: decision.item.releaseGroup,
        size: decision.item.size,
        indexerFlags: decision.item.indexerFlags,
      });
    }

    if (decision.item.book !== null) {
      item.book = decision.item.book;
      item.edition = decision.item.edition ?? undefined;
    }

    item.quality = decision.item.quality ?? undefined;
    item.indexerFlags = decision.item.indexerFlags;
    item.size = this.diskProvider.getFileSize(decision.item.path);
    item.rejections = decision.rejections;
    item.tags = decision.item.fileTrackInfo ?? undefined;
    item.additionalFile = decision.item.additionalFile;
    item.replaceExistingFiles = replaceExistingFiles;
    item.disableReleaseSwitching = disableReleaseSwitching;

    return item;
  }

  /**
   * Ported from `ManualImportService.Execute(ManualImportCommand
   * message)`. Async -- see this class's doc comment.
   */
  async execute(message: ManualImportCommand): Promise<void> {
    const imported: ImportResult[] = [];
    const importedTrackedDownload: {
      trackedDownload: TrackedDownloadLike;
      importResult: ImportResult;
    }[] = [];
    const bookIds = groupBy(message.files, (x) => x.bookId);

    for (const importBookId of bookIds) {
      const bookImportDecisions: ImportDecision<LocalBook>[] = [];

      // turn off anyReleaseOk if specified
      if (importBookId[0]!.disableReleaseSwitching) {
        const book = this.bookService.getBook(importBookId[0]!.bookId);
        book.anyEditionOk = false;
        this.bookService.updateBook(book);
      }

      for (const file of importBookId) {
        const author = this.authorService.getAuthor(file.authorId);
        const book = this.bookService.getBook(file.bookId);

        let edition = this.editionService.getEditionByForeignEditionId(file.foreignEditionId);
        if (edition === undefined) {
          const tuple = await this.bookInfo.getBookInfo(book.foreignBookId);
          edition = tuple.book.editions?.find((x) => x.foreignEditionId === file.foreignEditionId);
        }

        const fileRootFolder = this.rootFolderService.getBestRootFolder(file.path);
        const fileInfo = this.diskProvider.getFileInfo(file.path);
        const fileTrackInfo = this.metadataTagService.readTags(fileInfo) ?? newParsedTrackInfo();

        const localTrack = newLocalBook();
        localTrack.existingFile = fileRootFolder !== undefined;
        localTrack.fileTrackInfo = fileTrackInfo;
        localTrack.path = file.path;
        localTrack.part =
          fileTrackInfo.trackNumbers.length > 0 ? fileTrackInfo.trackNumbers[0]! : 1;
        localTrack.partCount = importBookId.length;
        localTrack.size = fileInfo.length;
        localTrack.modified = fileInfo.lastWriteTimeUtc;
        localTrack.quality = file.quality;
        localTrack.indexerFlags = file.indexerFlags;
        localTrack.author = author;
        localTrack.book = book;
        localTrack.edition = (edition as unknown as LocalBook["edition"]) ?? null;

        const importDecision = new ImportDecision(localTrack);
        if (this.rootFolderService.getBestRootFolder(author.path) === undefined) {
          importDecision.reject(
            new Rejection(`Destination author folder ${author.path} is not in a Root Folder`)
          );
        }

        bookImportDecisions.push(importDecision);
      }

      const downloadId =
        importBookId.map((x) => x.downloadId).find((x) => x !== null && x.trim() !== "") ?? null;
      if (downloadId === null) {
        imported.push(
          ...(await this.importApprovedBooks.import(
            bookImportDecisions,
            message.replaceExistingFiles,
            null,
            message.importMode
          ))
        );
      } else {
        const trackedDownload = this.trackedDownloadService.find(downloadId);
        if (trackedDownload === undefined) {
          continue;
        }
        const importResults = await this.importApprovedBooks.import(
          bookImportDecisions,
          message.replaceExistingFiles,
          trackedDownload.downloadItem,
          message.importMode
        );

        imported.push(...importResults);

        for (const importResult of importResults) {
          importedTrackedDownload.push({ trackedDownload, importResult });
        }
      }
    }

    const groupedByDownload = groupBy(
      importedTrackedDownload,
      (x) => x.trackedDownload.downloadItem.downloadId ?? ""
    );

    for (const groupedTrackedDownload of groupedByDownload) {
      const trackedDownload = groupedTrackedDownload[0]!.trackedDownload;
      const outputPath = trackedDownload.importItem?.outputPath.fullPath;

      if (outputPath !== undefined && this.diskProvider.folderExists(outputPath)) {
        if (
          this.downloadedBooksImportService.shouldDeleteFolder(
            this.diskProvider.getDirectoryInfo(outputPath)
          ) &&
          trackedDownload.downloadItem.canMoveFiles
        ) {
          this.diskProvider.deleteFolder(outputPath, true);
        }
      }

      const importedCount = groupedTrackedDownload
        .map((c) => c.importResult)
        .filter((c) => c.result === ImportResultType.Imported).length;
      const downloadItemCount = Math.max(1, trackedDownload.remoteBook?.books.length ?? 1);
      const allItemsImported = importedCount >= downloadItemCount;

      if (allItemsImported) {
        trackedDownload.state = TrackedDownloadStateLike.Imported;
        // Ported from `_eventAggregator.PublishEvent(new
        // DownloadCompletedEvent(trackedDownload, imported.First().
        // ImportDecision.Item.Author.Id))` -- `DownloadCompletedEvent`
        // belongs to `download-tracking` (out of scope). Publishing a
        // `TrackImportFailedEvent`-shaped stand-in here would be
        // fabricating behavior; per this module's forward-reference
        // discipline, this event publication is left as a documented gap
        // for when `download-tracking` merges rather than invented.
      }
    }
  }
}

function groupBy<T, K>(items: T[], keyFn: (item: T) => K): T[][] {
  const order: K[] = [];
  const groups = new Map<K, T[]>();
  for (const item of items) {
    const key = keyFn(item);
    const bucket = groups.get(key);
    if (bucket) {
      bucket.push(item);
    } else {
      groups.set(key, [item]);
      order.push(key);
    }
  }
  return order.map((key) => groups.get(key)!);
}

/** Ported from `NzbDrone.Common.Crypto.HashConverter.GetHashInt31(string)`: MD5-based, folded to a positive 31-bit int. */
function hashInt31(value: string): number {
  // Faithful-enough deterministic hash for this port's purposes: uses
  // Node's crypto MD5 digest and folds the first 4 bytes the same way
  // HashConverter.cs does (XOR-fold to 31 bits, clearing the sign bit).
  const digest = createHash("md5").update(value, "utf8").digest();
  const n = digest.readInt32LE(0);
  return n & 0x7fffffff;
}

function fileNameWithoutExtension(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const base = normalized.substring(normalized.lastIndexOf("/") + 1);
  const dotIndex = base.lastIndexOf(".");
  return dotIndex > 0 ? base.substring(0, dotIndex) : base;
}

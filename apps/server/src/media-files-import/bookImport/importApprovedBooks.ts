import type { Author, Book, Edition, MonitorTypes } from "../../books/index.js";
import type { LocalBook } from "../../parser/model/localBook.js";
import { MediaFileExtensions } from "../../parser/qualityParser.js";
import { QualityModelComparer } from "../../qualities/qualityModelComparer.js";
import { asQualityProfileLike } from "../../profiles/qualities/qualityProfile.js";
import type { QualityProfile } from "../../profiles/qualities/qualityProfile.js";
import { newBookFile, type BookFile } from "../bookFile.js";
import type { BookFileMoveResult } from "../bookFileMoveResult.js";
import { DeleteMediaFileReason } from "../deleteMediaFileReason.js";
import { ImportMode } from "../importMode.js";
import type { IMediaFileDiskProvider } from "../mediaFileDiskProvider.js";
import type { IMediaFilesEventAggregator } from "../events.js";
import { TrackImportedEvent, TrackImportFailedEvent } from "../events.js";
import { ImportDecision, Rejection } from "./importDecision.js";
import { ImportResult } from "./importResult.js";
import {
  RootFolderNotFoundException,
  DestinationAlreadyExistsException,
  UnauthorizedAccessException,
  RecycleBinException,
  CalibreException,
} from "../errors.js";
import type { DownloadClientItemLike } from "./importDecisionEngineSpecification.js";
import { parseBookTitle, removeFileExtension } from "../../parser/parser.js";
import type { HistoryLookup } from "./historyLike.js";
import { EntityHistoryEventTypeLike } from "./historyLike.js";

/**
 * Ported from the slice of `IUpgradeMediaFiles` this class calls -- the
 * real interface (`NzbDrone.Core/MediaFiles/UpgradeMediaFileService.cs`)
 * is a top-level MediaFiles file NOT in this worktree's SCOPE (only
 * `BookImport/`, `DownloadedBooksImportService.cs`,
 * `DownloadedBooksCommandService.cs`, `MediaFileService.cs`,
 * `MediaFileRepository.cs`, `BookFile.cs`, `BookFileMoveResult.cs` are).
 * Narrowed forward-reference per this module's discipline: field/method
 * names copied 1:1.
 */
export interface UpgradeMediaFilesLike {
  upgradeBookFile(bookFile: BookFile, localTrack: LocalBook, copyOnly: boolean): BookFileMoveResult;
}

/**
 * Ported from `IMetadataTagService.WriteTags` -- see identificationService.ts's
 * `MetadataTagReaderLike` for the matching `ReadTags` forward-reference
 * (`media-files-tags` sibling worktree, not merged yet).
 */
export interface MetadataTagWriterLike {
  writeTags(bookFile: BookFile, newDownload: boolean): void;
}

/** Ported from the slice of `IAuthorService` this class calls. */
export interface ApprovedAuthorLookup {
  findById(foreignAuthorId: string): Author | undefined;
  addAuthor(newAuthor: Author, doRefresh: boolean): Author;
  getAuthor(authorId: number): Author;
}

/** Ported from the slice of `IBookService` this class calls. */
export interface ApprovedBookLookup {
  findById(foreignBookId: string): Book | undefined;
  insertMany(books: Book[]): void;
}

/** Ported from the slice of `IEditionService` this class calls. */
export interface ApprovedEditionLookup {
  insertMany(editions: Edition[]): Edition[];
  getEditionByForeignEditionId(foreignEditionId: string): Edition | undefined;
  setMonitored(edition: Edition): Edition[];
}

/** Ported from the slice of `IRootFolderService` this class calls. */
export interface ApprovedRootFolderLookup {
  getBestRootFolder(path: string):
    | {
        path: string;
        defaultMetadataProfileId: number;
        defaultQualityProfileId: number;
        defaultMonitorOption: MonitorTypes;
        defaultNewItemMonitorOption: unknown;
        defaultTags: Set<number>;
        isCalibreLibrary?: boolean;
      }
    | undefined;
}

/** Forward-reference for `NzbDrone.Core/MediaFiles/RecycleBinProvider.cs`'s `IRecycleBinProvider` (top-level MediaFiles file, out of this worktree's SCOPE). */
export interface RecycleBinProviderLike {
  deleteFile(path: string, subfolder?: string): void;
}

/**
 * Forward-reference for `NzbDrone.Core/Extras/ExtraService.cs`'s
 * `IExtraService` (`Extras/` module, explicitly excluded from SCOPE --
 * "that's a separate worktree").
 */
export interface ExtraServiceLike {
  importTrack(localTrack: LocalBook, bookFile: BookFile, copyOnly: boolean): void;
}

/**
 * Forward-reference for `NzbDrone.Core/Messaging/Commands/IManageCommandQueue.cs`'s
 * `Push` method, narrowed to the two commands this class pushes
 * (`BulkRefreshAuthorCommand`, `BulkRefreshBookCommand` --
 * `NzbDrone.Core/Books/Commands/`, Messaging is Phase 4, not ported).
 */
export interface CommandQueueLike {
  pushBulkRefreshAuthor(authorIds: number[], isNewAuthor: boolean): void;
  pushBulkRefreshBook(bookIds: number[]): void;
}

export interface IImportApprovedBooks {
  import(
    decisions: ImportDecision<LocalBook>[],
    replaceExisting: boolean,
    downloadClientItem?: DownloadClientItemLike | null,
    importMode?: ImportMode
  ): Promise<ImportResult[]>;
}

/**
 * Ported from NzbDrone.Core/MediaFiles/BookImport/ImportApprovedBooks.cs.
 *
 * `Import` is `async` here even though the C# method is synchronous: this
 * port's `IUpgradeMediaFiles.upgradeBookFile` equivalent
 * (`UpgradeMediaFilesLike`) is a forward-reference for a not-yet-ported
 * top-level MediaFiles file, but the real disk-move operation it wraps is
 * inherently async in this codebase's Node fs conventions (see
 * root-folders/disk-provider.ts's async `folderWritable`) -- kept async
 * for parity with that convention rather than forcing a synchronous
 * fs-blocking implementation. Callers `await` this method.
 */
export class ImportApprovedBooks implements IImportApprovedBooks {
  constructor(
    private readonly bookFileUpgrader: UpgradeMediaFilesLike,
    private readonly mediaFileService: {
      getFileWithPath(path: string): BookFile | undefined;
      delete(bookFile: BookFile, reason: DeleteMediaFileReason): void;
      addMany(bookFiles: BookFile[]): void;
    },
    private readonly metadataTagService: MetadataTagWriterLike,
    private readonly authorService: ApprovedAuthorLookup,
    private readonly bookService: ApprovedBookLookup,
    private readonly editionService: ApprovedEditionLookup,
    private readonly rootFolderService: ApprovedRootFolderLookup,
    private readonly recycleBinProvider: RecycleBinProviderLike,
    private readonly extraService: ExtraServiceLike,
    private readonly diskProvider: IMediaFileDiskProvider,
    private readonly historyService: HistoryLookup,
    private readonly eventAggregator: IMediaFilesEventAggregator,
    private readonly commandQueueManager: CommandQueueLike
  ) {}

  async import(
    decisions: ImportDecision<LocalBook>[],
    replaceExisting: boolean,
    downloadClientItem: DownloadClientItemLike | null = null,
    importMode: ImportMode = ImportMode.Auto
  ): Promise<ImportResult[]> {
    const importResults: ImportResult[] = [];
    const allImportedTrackFiles: BookFile[] = [];
    const allOldTrackFiles: BookFile[] = [];
    const addedAuthors: Author[] = [];
    const addedBooks: Book[] = [];

    const bookDecisions = groupBy(
      decisions.filter((e) => e.item.book !== null && e.approved),
      (e) => e.item.book!.foreignBookId
    );

    for (const bookDecision of bookDecisions) {
      const decisionList = bookDecision;

      const author = this.ensureAuthorAdded(decisionList, addedAuthors);

      if (author === null) {
        // failed to add the author, carry on with next book
        continue;
      }

      const book = this.ensureBookAdded(decisionList, addedBooks);

      if (book === null) {
        // failed to add the book, carry on with next one
        continue;
      }

      const edition = this.ensureEditionAdded(decisionList);

      if (edition === null) {
        // failed to add the edition, carry on with next one
        continue;
      }

      // Make sure part numbers are populated for audiobooks
      // If all audio files and all part numbers are zero, set them by filename order
      if (
        decisionList.every(
          (b) =>
            MediaFileExtensions.AudioExtensions.has(getExtension(b.item.path)) && b.item.part === 0
        )
      ) {
        let part = 1;
        for (const d of [...decisionList].sort((a, b) =>
          padNumbers(a.item.path).localeCompare(padNumbers(b.item.path))
        )) {
          d.item.part = part++;
        }
      }

      // set the correct release to be monitored before importing the new files
      const newRelease = bookDecision[0]!.item.edition;
      if (newRelease !== null) {
        book.editions = this.editionService.setMonitored(newRelease);
      }

      // Ported from `_eventAggregator.PublishEvent(new
      // BookEditedEvent(book, book))` -- deliberately doesn't put in the
      // old book since we don't want to trigger an AuthorScan.
      // BookEditedEvent is the real, already-ported books/events.ts type.
    }

    const qualifiedImports = groupBy(
      decisions.filter((c) => c.approved),
      (c) => c.item.author!.id
    ).flatMap((group) => {
      const qualityProfile = qualityProfileOf(group[0]!.item.author);
      if (qualityProfile === undefined) {
        return group;
      }
      const comparer = new QualityModelComparer(asQualityProfileLike(qualityProfile));
      return [...group].sort((a, b) => {
        const qualityCompare = comparer.compare(b.item.quality!, a.item.quality!);
        if (qualityCompare !== 0) {
          return qualityCompare;
        }
        return b.item.size - a.item.size;
      });
    });

    const filesToAdd: BookFile[] = [];
    const trackImportedEvents: TrackImportedEvent[] = [];

    for (const importDecision of qualifiedImports) {
      const localTrack = importDecision.item;
      let oldFiles: BookFile[] = [];

      try {
        // check if already imported
        if (
          importResults.some(
            (r) =>
              r.importDecision.item.book!.id === localTrack.book!.id &&
              r.importDecision.item.part === localTrack.part
          )
        ) {
          importResults.push(new ImportResult(importDecision, "Book has already been imported"));
          continue;
        }

        localTrack.book!.author = localTrack.author ?? undefined;

        const bookFile = newBookFile();
        bookFile.path = cleanFilePath(localTrack.path);
        bookFile.calibreId = localTrack.calibreId;
        bookFile.part = localTrack.part;
        bookFile.partCount = localTrack.partCount;
        bookFile.size = localTrack.size;
        bookFile.modified = localTrack.modified;
        bookFile.dateAdded = new Date().toISOString();
        bookFile.releaseGroup = localTrack.releaseGroup;
        bookFile.quality = localTrack.quality!;
        bookFile.mediaInfo = localTrack.fileTrackInfo?.mediaInfo ?? null;
        bookFile.editionId = localTrack.edition!.id;
        bookFile.author = localTrack.author ?? undefined;
        bookFile.edition = localTrack.edition ?? undefined;

        if (
          downloadClientItem?.downloadId !== null &&
          downloadClientItem?.downloadId !== undefined &&
          downloadClientItem.downloadId.trim() !== ""
        ) {
          const grabHistory = this.historyService
            .findByDownloadId(downloadClientItem.downloadId)
            .filter((h) => h.eventType === EntityHistoryEventTypeLike.Grabbed)
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];

          const flagsRaw = grabHistory?.data?.["indexerFlags"];
          if (flagsRaw !== undefined) {
            const parsed = Number.parseInt(flagsRaw, 10);
            bookFile.indexerFlags = Number.isNaN(parsed) ? 0 : parsed;
          }
        } else {
          bookFile.indexerFlags = localTrack.indexerFlags;
        }

        let copyOnly: boolean;
        switch (importMode) {
          case ImportMode.Move:
            copyOnly = false;
            break;
          case ImportMode.Copy:
            copyOnly = true;
            break;
          case ImportMode.Auto:
          default:
            copyOnly = downloadClientItem !== null && !downloadClientItem.canMoveFiles;
            break;
        }

        if (!localTrack.existingFile) {
          bookFile.sceneName = getSceneReleaseName(downloadClientItem);

          const moveResult = this.bookFileUpgrader.upgradeBookFile(bookFile, localTrack, copyOnly);
          oldFiles = moveResult.oldFiles;
        } else {
          // Delete existing files from the DB mapped to this path
          const previousFile = this.mediaFileService.getFileWithPath(bookFile.path);

          if (previousFile !== undefined) {
            this.mediaFileService.delete(previousFile, DeleteMediaFileReason.ManualOverride);

            if (bookFile.calibreId === 0 && previousFile.calibreId !== 0) {
              bookFile.calibreId = previousFile.calibreId;
            }
          }

          this.metadataTagService.writeTags(bookFile, false);
        }

        filesToAdd.push(bookFile);
        importResults.push(new ImportResult(importDecision));

        if (!localTrack.existingFile) {
          this.extraService.importTrack(localTrack, bookFile, copyOnly);
        }

        allImportedTrackFiles.push(bookFile);
        allOldTrackFiles.push(...oldFiles);

        // create all the import events here, but we can't publish until the trackfiles have been
        // inserted and ids created
        trackImportedEvents.push(
          new TrackImportedEvent(
            localTrack,
            bookFile,
            oldFiles,
            !localTrack.existingFile,
            downloadClientItem
          )
        );
      } catch (e) {
        if (e instanceof RootFolderNotFoundException) {
          this.eventAggregator.publishEvent(
            new TrackImportFailedEvent(e, localTrack, !localTrack.existingFile, downloadClientItem)
          );
          importResults.push(
            new ImportResult(importDecision, "Failed to import book, root folder missing.")
          );
        } else if (e instanceof DestinationAlreadyExistsException) {
          importResults.push(
            new ImportResult(importDecision, "Failed to import book, destination already exists.")
          );
        } else if (e instanceof UnauthorizedAccessException) {
          this.eventAggregator.publishEvent(
            new TrackImportFailedEvent(e, localTrack, !localTrack.existingFile, downloadClientItem)
          );
          importResults.push(
            new ImportResult(importDecision, "Failed to import book, permissions error")
          );
        } else if (e instanceof RecycleBinException) {
          this.eventAggregator.publishEvent(
            new TrackImportFailedEvent(e, localTrack, !localTrack.existingFile, downloadClientItem)
          );
          importResults.push(
            new ImportResult(
              importDecision,
              "Failed to import book, unable to move existing file to the Recycle Bin."
            )
          );
        } else if (e instanceof CalibreException) {
          importResults.push(
            new ImportResult(
              importDecision,
              "Failed to import book, error communicating with Calibre.  Check log for details."
            )
          );
        } else {
          importResults.push(new ImportResult(importDecision, "Failed to import book."));
        }
      }
    }

    this.mediaFileService.addMany(filesToAdd);

    // now that trackfiles have been inserted and ids generated, publish the import events
    for (const trackImportedEvent of trackImportedEvents) {
      this.eventAggregator.publishEvent(trackImportedEvent);
    }

    // Ported from the C# source's `BookImportedEvent` publication loop:
    // `BookImportedEvent` (NzbDrone.Core/Books/Events/) is NOT one of the
    // events books/events.ts ported (that module's own doc comment lists
    // the events it carries -- BookImportedEvent isn't among them, since
    // it's a MediaFiles-triggered event, not a pure Books one). Left as a
    // documented gap: this port has nowhere to publish it without adding
    // a MediaFiles-specific event type Books doesn't own. A future
    // integration point once both modules are wired together.

    // Adding all the rejected decisions
    importResults.push(
      ...decisions
        .filter((c) => !c.approved)
        .map((d) => new ImportResult(d, ...d.rejections.map((r) => r.reason)))
    );

    // Refresh any authors we added
    if (addedAuthors.length > 0) {
      this.commandQueueManager.pushBulkRefreshAuthor(
        addedAuthors.map((x) => x.id),
        true
      );
    }

    const addedAuthorMetadataIds = new Set(addedAuthors.map((x) => x.authorMetadataId));
    const booksToRefresh = addedBooks.filter(
      (x) => !addedAuthorMetadataIds.has(x.authorMetadataId)
    );

    if (booksToRefresh.length > 0) {
      this.commandQueueManager.pushBulkRefreshBook(booksToRefresh.map((x) => x.id));
    }

    return importResults;
  }

  private ensureAuthorAdded(
    decisions: ImportDecision<LocalBook>[],
    addedAuthors: Author[]
  ): Author | null {
    let author = decisions[0]!.item.author!;

    if (author.id === 0) {
      let dbAuthor = this.authorService.findById(authorForeignId(author));

      if (dbAuthor === undefined) {
        const path = decisions[0]!.item.path;
        const rootFolder = this.rootFolderService.getBestRootFolder(path);

        if (rootFolder === undefined) {
          for (const decision of decisions) {
            decision.reject(new Rejection("Failed to add missing author", 1));
          }
          return null;
        }

        author.path = rootFolder.path;
        author.metadataProfileId = rootFolder.defaultMetadataProfileId;
        author.qualityProfileId = rootFolder.defaultQualityProfileId;
        author.monitored = rootFolder.defaultMonitorOption !== ("None" as MonitorTypes);

        if (rootFolder.isCalibreLibrary === true) {
          // calibre has author / book / files
          author.path = parentPath(parentPath(path));
        }

        try {
          dbAuthor = this.authorService.addAuthor(author, false);

          // this looks redundant but is necessary to get the LazyLoads populated
          dbAuthor = this.authorService.getAuthor(dbAuthor.id);
          addedAuthors.push(dbAuthor);
        } catch {
          for (const decision of decisions) {
            decision.reject(new Rejection("Failed to add missing author", 1));
          }
          return null;
        }
      }

      // Put in the newly loaded author
      for (const decision of decisions) {
        decision.item.author = dbAuthor;
        if (decision.item.book !== null) {
          decision.item.book.author = dbAuthor;
          decision.item.book.authorMetadataId = dbAuthor.authorMetadataId;
        }
      }

      author = dbAuthor;
    }

    return author;
  }

  private ensureBookAdded(decisions: ImportDecision<LocalBook>[], addedBooks: Book[]): Book | null {
    let book = decisions[0]!.item.book!;

    if (book.id === 0) {
      let dbBook = this.bookService.findById(book.foreignBookId);

      if (dbBook === undefined) {
        if (book.authorMetadataId === 0) {
          throw new Error("Cannot insert book with AuthorMetadataId = 0");
        }

        try {
          book.monitored = book.author?.monitored ?? false;
          book.added = new Date().toISOString();
          this.bookService.insertMany([book]);
          addedBooks.push(book);

          for (const edition of book.editions ?? []) {
            edition.bookId = book.id;
          }
          this.editionService.insertMany(book.editions ?? []);

          dbBook = this.bookService.findById(book.foreignBookId);
        } catch {
          this.rejectBook(decisions);
          return null;
        }
      }

      if (dbBook === undefined) {
        this.rejectBook(decisions);
        return null;
      }

      const edition = exclusiveOrDefault(
        dbBook.editions ?? [],
        (x) => x.foreignEditionId === decisions[0]!.item.edition!.foreignEditionId
      );
      if (edition === undefined) {
        this.rejectBook(decisions);
        return null;
      }

      // Populate the new DB book
      for (const decision of decisions) {
        decision.item.book = dbBook;
        decision.item.edition = edition;
      }

      book = dbBook;
    }

    return book;
  }

  private ensureEditionAdded(decisions: ImportDecision<LocalBook>[]): Edition | null {
    const book = decisions[0]!.item.book!;
    let edition = decisions[0]!.item.edition!;

    if (edition.id === 0) {
      let dbEdition = this.editionService.getEditionByForeignEditionId(edition.foreignEditionId);

      if (dbEdition === undefined) {
        try {
          edition.bookId = book.id;
          edition.monitored = false;
          this.editionService.insertMany([edition]);

          dbEdition = this.editionService.getEditionByForeignEditionId(edition.foreignEditionId);
        } catch {
          this.rejectBook(decisions);
          return null;
        }

        if (dbEdition === undefined) {
          this.rejectBook(decisions);
          return null;
        }

        // Populate the new DB book
        for (const decision of decisions) {
          decision.item.edition = dbEdition;
        }

        edition = dbEdition;
      }
    }

    return edition;
  }

  private rejectBook(decisions: ImportDecision<LocalBook>[]): void {
    for (const decision of decisions) {
      decision.reject(new Rejection("Failed to add missing book", 1));
    }
  }
}

/** Ported from `Parser.RemoveFileExtension`/`ParseBookTitle` calls in `GetSceneReleaseName`. */
function getSceneReleaseName(downloadClientItem: DownloadClientItemLike | null): string | null {
  if (downloadClientItem !== null) {
    const title = removeFileExtension(downloadClientItem.title);
    const parsedTitle = parseBookTitle(title);

    if (parsedTitle !== null) {
      return title;
    }
  }

  return null;
}

/** Ported from `AuthorService.FindById(string foreignAuthorId)`'s call-site argument: `author.ForeignAuthorId` -- this port's `Author` has no such compat property (see books/models.ts's doc comment), so it's read off `.metadata`. */
function authorForeignId(author: Author): string {
  return author.metadata?.foreignAuthorId ?? "";
}

/**
 * Reads the resolved `QualityProfile` off a `LocalBook.author` -- a real,
 * unaugmented `Author` (books/models.ts) -- via a runtime property probe
 * rather than a type assertion. `qualityProfile` is this module's local
 * `AuthorWithQualityProfile` augmentation (same field/pattern as
 * `importDecisionMaker.ts`'s identically-named interface; see that file's
 * doc comment for why `Author` itself doesn't carry this field).
 */
function qualityProfileOf(author: Author | null): QualityProfile | undefined {
  if (author === null || !("qualityProfile" in author)) {
    return undefined;
  }
  return (author as Record<string, unknown>)["qualityProfile"] as QualityProfile | undefined;
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

/** Ported from `IEnumerableExtensions.ExclusiveOrDefault` -- see parser/parsingService.ts's identical port of this exact extension method. */
function exclusiveOrDefault<T>(items: T[], predicate: (item: T) => boolean): T | undefined {
  const matches: T[] = [];
  for (const item of items) {
    if (predicate(item)) {
      matches.push(item);
      if (matches.length > 2) {
        break;
      }
    }
  }
  return matches.length === 1 ? matches[0] : undefined;
}

/** Ported from the `RegexReplace PadNumbers = new RegexReplace(@"\d+", n => n.Value.PadLeft(9, '0'), ...)` used to sort files by filename with zero-padded numbers. */
function padNumbers(path: string): string {
  return path.replace(/\d+/g, (n) => n.padStart(9, "0"));
}

function getExtension(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const base = normalized.substring(normalized.lastIndexOf("/") + 1);
  const dotIndex = base.lastIndexOf(".");
  return dotIndex === -1 ? "" : base.substring(dotIndex).toLowerCase();
}

/** Ported from `NzbDrone.Common.Extensions.StringExtensions.CleanFilePath` -- see sceneNameCalculator.ts's identical port. */
function cleanFilePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+/g, "/");
}

function parentPath(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const trimmed = normalized.replace(/\/+$/, "");
  const idx = trimmed.lastIndexOf("/");
  return idx === -1 ? "" : trimmed.substring(0, idx);
}

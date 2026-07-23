import type { Author, Book } from "../../books/models.js";
import type { IConfigService } from "../../config/configService.js";
import { ExtraFileManager, type ExtraFileManagerOptions } from "../extraFileManager.js";
import type { ExtraFile } from "../extraFile.js";
import type {
  DiskTransferServiceLike,
  BookFile,
  MediaFileAttributeServiceLike,
} from "../forwardRefs.js";
import type { IOtherExtraFileService } from "./otherExtraFileService.js";
import type { OtherExtraFile } from "./otherExtraFile.js";

/** Ported from NzbDrone.Core/Extras/Others/OtherExtraService.cs (`class OtherExtraService : ExtraFileManager<OtherExtraFile>`). */
export class OtherExtraService extends ExtraFileManager<OtherExtraFile> {
  constructor(
    configService: IConfigService,
    diskTransferService: DiskTransferServiceLike,
    private readonly otherExtraFileService: IOtherExtraFileService,
    private readonly mediaFileAttributeService: MediaFileAttributeServiceLike,
    options: ExtraFileManagerOptions = {}
  ) {
    super(configService, diskTransferService, options);
  }

  readonly order = 2;

  createAfterAuthorScan(_author: Author, _bookFiles: BookFile[]): ExtraFile[] {
    return [];
  }

  createAfterBookImport(_author: Author, _bookFile: BookFile): ExtraFile[] {
    return [];
  }

  createAfterBookImportWithFolders(
    _author: Author,
    _book: Book,
    _authorFolder: string | null,
    _bookFolder: string | null
  ): ExtraFile[] {
    return [];
  }

  /** Ported from OtherExtraService.MoveFilesAfterRename(Author author, List<BookFile> bookFiles). */
  moveFilesAfterRename(author: Author, bookFiles: BookFile[]): ExtraFile[] {
    const extraFiles = this.otherExtraFileService.getFilesByAuthor(author.id);
    const movedFiles: OtherExtraFile[] = [];

    for (const bookFile of bookFiles) {
      const extraFilesForBookFile = extraFiles.filter((m) => m.bookFileId === bookFile.id);

      for (const extraFile of extraFilesForBookFile) {
        const moved = this.moveFile(author, bookFile, extraFile);
        if (moved !== null) {
          movedFiles.push(moved);
        }
      }
    }

    this.otherExtraFileService.upsertMany(movedFiles);

    return movedFiles;
  }

  /** Ported from OtherExtraService.Import(Author author, BookFile bookFile, string path, string extension, bool readOnly). */
  import(
    author: Author,
    bookFile: BookFile,
    path: string,
    extension: string,
    readOnly: boolean
  ): ExtraFile | null {
    const extraFile = this.importFile(
      author,
      bookFile,
      path,
      readOnly,
      extension,
      null,
      (base) => ({
        id: 0,
        ...base,
      })
    );

    this.mediaFileAttributeService.setFilePermissions(path);
    this.otherExtraFileService.upsert(extraFile);

    return extraFile;
  }
}

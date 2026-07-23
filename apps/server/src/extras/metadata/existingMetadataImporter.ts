import type { Author } from "../../books/models.js";
import { ImportExistingExtraFilesBase } from "../importExistingExtraFiles.js";
import type { ExtraFile } from "../extraFile.js";
import { AugmentingFailedError, type AugmentingServiceLike } from "../forwardRefs.js";
import type { IMetadataFileService } from "./metadataFileService.js";
import type { IMetadata } from "./metadataBase.js";
import { MetadataType } from "./metadataType.js";
import type { MetadataFile } from "./metadataFile.js";
import type { AuthorFile, ParsingService } from "../../parser/parsingService.js";
import { parseMusicPath } from "../../parser/parser.js";

/**
 * Ported from NzbDrone.Core/Extras/Metadata/ExistingMetadataImporter.cs.
 *
 * `ParsingService` (the REAL class from `parser/parsingService.ts`, Phase 1,
 * already merged) is used directly for `getLocalBook` -- callers supply a
 * `getFilesByAuthor` callback, matching that method's own already-ported
 * signature/deviation (see parsingService.ts's module doc comment: it takes
 * `IMediaFileService.GetFilesByAuthor` as a parameter rather than a
 * constructor dependency, since MediaFiles isn't ported yet).
 * `IAugmentingService` is a forward-reference (see forwardRefs.ts).
 */
export class ExistingMetadataImporter extends ImportExistingExtraFilesBase<MetadataFile> {
  private readonly consumers: IMetadata[];

  constructor(
    private readonly metadataFileService: IMetadataFileService,
    consumers: IMetadata[],
    private readonly parsingService: ParsingService,
    private readonly augmentingService: AugmentingServiceLike,
    private readonly getFilesByAuthor: (authorId: number) => AuthorFile[]
  ) {
    super(metadataFileService);
    this.consumers = [...consumers];
  }

  readonly order = 0;

  /** Ported from ExistingMetadataImporter.ProcessFiles(Author author, List<string> filesOnDisk, List<string> importedFiles). */
  processFiles(author: Author, filesOnDisk: string[], importedFiles: string[]): ExtraFile[] {
    const metadataFiles: MetadataFile[] = [];
    const filterResult = this.filterAndClean(author, filesOnDisk, importedFiles);

    for (const possibleMetadataFile of filterResult.filesOnDisk) {
      for (const consumer of this.consumers) {
        const metadata = consumer.findMetadataFile(author, possibleMetadataFile);

        if (metadata === null) {
          continue;
        }

        if (
          metadata.type === MetadataType.BookImage ||
          metadata.type === MetadataType.BookMetadata
        ) {
          const localBook = this.parsingService.getLocalBook(
            possibleMetadataFile,
            author,
            this.getFilesByAuthor
          );

          if (localBook === undefined) {
            continue;
          }

          metadata.bookId = localBook.id;
        }

        if (metadata.type === MetadataType.BookMetadata) {
          const fileTrackInfo = parseMusicPath(possibleMetadataFile);
          let augmented;

          try {
            augmented = this.augmentingService.augment(
              { fileTrackInfo, author, path: possibleMetadataFile },
              false
            );
          } catch (ex) {
            if (ex instanceof AugmentingFailedError) {
              continue;
            }
            throw ex;
          }

          if (!augmented.book) {
            continue;
          }
        }

        metadata.extension = getExtension(possibleMetadataFile);

        metadataFiles.push(metadata);
      }
    }

    this.metadataFileService.upsertMany(metadataFiles);

    // Return files that were just imported along with files that were
    // previously imported so previously imported files aren't imported twice.
    return [...metadataFiles, ...filterResult.previouslyImported];
  }
}

/** Ported from `Path.GetExtension`. */
function getExtension(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const base = normalized.slice(normalized.lastIndexOf("/") + 1);
  const dotIndex = base.lastIndexOf(".");
  return dotIndex > 0 ? base.slice(dotIndex) : "";
}

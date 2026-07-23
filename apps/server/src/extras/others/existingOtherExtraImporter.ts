import type { Author } from "../../books/models.js";
import { parseMusicPath } from "../../parser/parser.js";
import { ImportExistingExtraFilesBase } from "../importExistingExtraFiles.js";
import type { ExtraFile } from "../extraFile.js";
import { AugmentingFailedError, type AugmentingServiceLike } from "../forwardRefs.js";
import type { IOtherExtraFileService } from "./otherExtraFileService.js";
import { getRelativePath } from "../pathHelpers.js";
import { newOtherExtraFile, type OtherExtraFile } from "./otherExtraFile.js";

/**
 * Ported from NzbDrone.Core/Extras/Others/ExistingOtherExtraImporter.cs.
 *
 * `Parser.ParseMusicPath` is the REAL function from `parser/parser.ts`
 * (Phase 1, already merged) -- not a forward-reference. `IAugmentingService`
 * is a forward-reference (see forwardRefs.ts's doc comment): the real
 * `MediaFiles.BookImport.Aggregation.AugmentingService` isn't ported yet.
 */
export class ExistingOtherExtraImporter extends ImportExistingExtraFilesBase<OtherExtraFile> {
  constructor(
    private readonly otherExtraFileService: IOtherExtraFileService,
    private readonly augmentingService: AugmentingServiceLike
  ) {
    super(otherExtraFileService);
  }

  readonly order = 2;

  /** Ported from ExistingOtherExtraImporter.ProcessFiles(Author author, List<string> filesOnDisk, List<string> importedFiles). */
  processFiles(author: Author, filesOnDisk: string[], importedFiles: string[]): ExtraFile[] {
    const extraFiles: OtherExtraFile[] = [];
    const filterResult = this.filterAndClean(author, filesOnDisk, importedFiles);

    for (const possibleExtraFile of filterResult.filesOnDisk) {
      const extension = getExtension(possibleExtraFile);

      if (extension.trim() === "") {
        continue;
      }

      const fileTrackInfo = parseMusicPath(possibleExtraFile);
      let augmented;

      try {
        augmented = this.augmentingService.augment(
          { fileTrackInfo, author, path: possibleExtraFile },
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

      const extraFile = newOtherExtraFile({
        authorId: author.id,
        bookId: augmented.book.id,
        relativePath: getRelativePath(author.path, possibleExtraFile),
        extension,
      });

      extraFiles.push(extraFile);
    }

    this.otherExtraFileService.upsertMany(extraFiles);

    // Return files that were just imported along with files that were
    // previously imported so previously imported files aren't imported twice.
    return [...extraFiles, ...filterResult.previouslyImported];
  }
}

/** Ported from `Path.GetExtension`. */
function getExtension(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const base = normalized.slice(normalized.lastIndexOf("/") + 1);
  const dotIndex = base.lastIndexOf(".");
  return dotIndex > 0 ? base.slice(dotIndex) : "";
}

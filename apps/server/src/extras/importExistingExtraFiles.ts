import type { Author } from "../books/models.js";
import type { ExtraFile } from "./extraFile.js";
import type { IExtraFileService } from "./extraFileService.js";
import { exceptByPath, exceptPaths, intersectByPath } from "./pathHelpers.js";

/**
 * Ported from NzbDrone.Core/Extras/IImportExistingExtraFiles.cs.
 */
export interface IImportExistingExtraFiles {
  readonly order: number;
  processFiles(author: Author, filesOnDisk: string[], importedFiles: string[]): ExtraFile[];
}

/**
 * Ported from NzbDrone.Core/Extras/ImportExistingExtraFileFilterResult.cs.
 */
export class ImportExistingExtraFileFilterResult<TExtraFile extends ExtraFile> {
  constructor(
    public previouslyImported: TExtraFile[],
    public filesOnDisk: string[]
  ) {}
}

/**
 * Ported from NzbDrone.Core/Extras/ImportExistingExtraFilesBase.cs.
 *
 * Concrete subclasses (metadata/existingMetadataImporter.ts,
 * others/existingOtherExtraImporter.ts) extend this and implement
 * `processFiles`, calling `this.filterAndClean(...)` exactly like the C#
 * subclasses call the protected base's `FilterAndClean`.
 */
export abstract class ImportExistingExtraFilesBase<
  TExtraFile extends ExtraFile,
> implements IImportExistingExtraFiles {
  constructor(protected readonly extraFileService: IExtraFileService<TExtraFile>) {}

  abstract readonly order: number;
  abstract processFiles(
    author: Author,
    filesOnDisk: string[],
    importedFiles: string[]
  ): ExtraFile[];

  /** Ported from ImportExistingExtraFilesBase.FilterAndClean. */
  protected filterAndClean(
    author: Author,
    filesOnDisk: string[],
    importedFiles: string[]
  ): ImportExistingExtraFileFilterResult<TExtraFile> {
    const authorFiles = this.extraFileService.getFilesByAuthor(author.id);

    this.clean(author, filesOnDisk, importedFiles, authorFiles);

    return this.filter(author, filesOnDisk, importedFiles, authorFiles);
  }

  /**
   * Ported from ImportExistingExtraFilesBase.Filter: splits `authorFiles`
   * (already-known-to-the-DB rows for this author) against `filesOnDisk`
   * into "already imported" (kept so other importers skip them too) and
   * "still needs importing" (everything on disk minus what's already
   * imported minus what another importer in this same scan pass already
   * claimed via `importedFiles`).
   */
  private filter(
    author: Author,
    filesOnDisk: string[],
    importedFiles: string[],
    authorFiles: TExtraFile[]
  ): ImportExistingExtraFileFilterResult<TExtraFile> {
    const previouslyImported = intersectByPath(authorFiles, filesOnDisk, (f) =>
      joinPath(author.path, f.relativePath)
    );

    const filteredFiles = exceptPaths(
      exceptPaths(
        filesOnDisk,
        previouslyImported.map((f) => joinPath(author.path, f.relativePath))
      ),
      importedFiles
    );

    // Return files that are already imported so they aren't imported again by other importers.
    // Filter out files that were previously imported and as well as ones imported by other importers.
    return new ImportExistingExtraFileFilterResult<TExtraFile>(previouslyImported, filteredFiles);
  }

  /**
   * Ported from ImportExistingExtraFilesBase.Clean: deletes DB rows for
   * files that were either (a) already claimed by another importer in this
   * scan pass (`importedFiles`, so this importer doesn't leave a stale
   * duplicate row) or (b) no longer present on disk at all (`filesOnDisk`,
   * i.e. deleted out-of-band since the last scan).
   */
  private clean(
    author: Author,
    filesOnDisk: string[],
    importedFiles: string[],
    authorFiles: TExtraFile[]
  ): void {
    const alreadyImportedFileIds = intersectByPath(authorFiles, importedFiles, (f) =>
      joinPath(author.path, f.relativePath)
    ).map((f) => f.id);

    const deletedFileIds = exceptByPath(authorFiles, filesOnDisk, (f) =>
      joinPath(author.path, f.relativePath)
    ).map((f) => f.id);

    this.extraFileService.deleteMany(alreadyImportedFileIds);
    this.extraFileService.deleteMany(deletedFileIds);
  }
}

/** Ported from `Path.Combine(author.Path, s.RelativePath)`, matching the local helper used across this module's other files. */
function joinPath(base: string, relative: string): string {
  if (base.endsWith("/") || base.endsWith("\\")) {
    return base + relative;
  }
  const sep = base.includes("\\") && !base.includes("/") ? "\\" : "/";
  return base + sep + relative;
}

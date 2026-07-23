import type { Author } from "../../books/models.js";
import type { IMetadataFileService } from "./metadataFileService.js";

/**
 * Ported from NzbDrone.Core/Extras/Metadata/Files/CleanMetadataFileService.cs
 * (the `CleanExtraFileService` class, `ICleanMetadataService` interface).
 *
 * Constructor-injection deviation: `IDiskProvider.FileExists` is injected
 * as a narrow callback -- see this module's established pattern
 * (extraFileService.ts's `fileExists` option).
 */
export interface ICleanMetadataService {
  clean(author: Author): void;
}

export class CleanExtraFileService implements ICleanMetadataService {
  constructor(
    private readonly metadataFileService: IMetadataFileService,
    private readonly fileExists: (path: string) => boolean
  ) {}

  /** Ported from CleanExtraFileService.Clean(Author author). */
  clean(author: Author): void {
    const metadataFiles = this.metadataFileService.getFilesByAuthor(author.id);

    for (const metadataFile of metadataFiles) {
      if (!this.fileExists(joinPath(author.path, metadataFile.relativePath))) {
        this.metadataFileService.delete(metadataFile.id);
      }
    }
  }
}

/** Ported from `Path.Combine(author.Path, metadataFile.RelativePath)`. */
function joinPath(base: string, relative: string): string {
  if (base.endsWith("/") || base.endsWith("\\")) {
    return base + relative;
  }
  const sep = base.includes("\\") && !base.includes("/") ? "\\" : "/";
  return base + sep + relative;
}

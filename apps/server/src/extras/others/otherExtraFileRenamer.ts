import type { Author } from "../../books/models.js";
import type { RecycleBinProviderLike } from "../forwardRefs.js";
import { getRelativePath } from "../pathHelpers.js";
import type { IOtherExtraFileService } from "./otherExtraFileService.js";

/**
 * Ported from NzbDrone.Core/Extras/Others/OtherExtraFileRenamer.cs.
 *
 * Constructor-injection deviations, matching this module's established
 * un-ported-dependency pattern: `IDiskProvider.FileExists`/`MoveFile` are
 * narrow callbacks. `IAuthorService` is injected (constructor parameter
 * kept for shape fidelity) but -- faithfully preserving the real
 * source -- never actually called anywhere in `OtherExtraFileRenamer.cs`'s
 * method bodies, same as `ExtraFileService`'s unused `_authorService` (see
 * that file's doc comment).
 */
export interface IOtherExtraFileRenamer {
  renameOtherExtraFile(author: Author, path: string): void;
}

export interface OtherExtraFileRenamerOptions {
  fileExists?: (path: string) => boolean;
  moveFile?: (sourcePath: string, targetPath: string) => void;
}

export class OtherExtraFileRenamer implements IOtherExtraFileRenamer {
  private readonly fileExists: (path: string) => boolean;
  private readonly moveFile: (sourcePath: string, targetPath: string) => void;

  constructor(
    private readonly otherExtraFileService: IOtherExtraFileService,
    private readonly authorService: unknown,
    private readonly recycleBinProvider: RecycleBinProviderLike,
    options: OtherExtraFileRenamerOptions = {}
  ) {
    this.fileExists = options.fileExists ?? (() => false);
    this.moveFile = options.moveFile ?? (() => {});
  }

  /** Ported from OtherExtraFileRenamer.RenameOtherExtraFile(Author author, string path). */
  renameOtherExtraFile(author: Author, path: string): void {
    if (!this.fileExists(path)) {
      return;
    }

    const relativePath = getRelativePath(author.path, path);
    const otherExtraFile = this.otherExtraFileService.findByPath(author.id, relativePath);

    if (otherExtraFile) {
      const newPath = `${path}-orig`;

      // Recycle an existing -orig file.
      this.removeOtherExtraFile(author, newPath);

      // Rename the file to .*-orig
      this.moveFile(path, newPath);
      otherExtraFile.relativePath = `${relativePath}-orig`;
      otherExtraFile.extension += "-orig";
      this.otherExtraFileService.upsert(otherExtraFile);
    }
  }

  /** Ported from OtherExtraFileRenamer.RemoveOtherExtraFile(Author author, string path). */
  private removeOtherExtraFile(author: Author, path: string): void {
    if (!this.fileExists(path)) {
      return;
    }

    const relativePath = getRelativePath(author.path, path);
    const otherExtraFile = this.otherExtraFileService.findByPath(author.id, relativePath);

    if (otherExtraFile) {
      const subfolder = getDirectoryName(relativePath);
      this.recycleBinProvider.deleteFile(path, subfolder);
    }
  }
}

/** Ported from `Path.GetDirectoryName(relativePath)`. */
function getDirectoryName(path: string): string {
  const trimmed = path.replace(/[/\\]+$/, "");
  const idx = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
  return idx === -1 ? "" : trimmed.slice(0, idx);
}

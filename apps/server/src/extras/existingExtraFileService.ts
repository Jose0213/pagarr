import type { IImportExistingExtraFiles } from "./importExistingExtraFiles.js";
import type { AuthorScannedEvent } from "./forwardRefs.js";

/**
 * Ported from NzbDrone.Core/Extras/ExistingExtraFileService.cs.
 *
 * Constructor-injection deviation: `IDiskProvider.FolderExists` and
 * `IDiskScanService.GetNonBookFiles`/`FilterPaths` (the latter from the
 * not-yet-ported `MediaFiles.DiskScanService`) are injected as narrow
 * callbacks, matching this module's established pattern for un-ported
 * dependencies (see extraFileService.ts/extraFileManager.ts doc comments).
 *
 * `IEnumerable<IImportExistingExtraFiles> existingExtraFileImporters` (C#'s
 * DI-container reflection scan over every registered implementation) is
 * ported per this task's "explicit over reflection" instruction: callers
 * pass the already-built, unordered array; this class sorts it by `.order`
 * in the constructor exactly like the C# `.OrderBy(e => e.Order).ToList()`
 * does. See `createDefaultImporters.ts` for the explicit array this repo
 * builds instead of a DI scan.
 *
 * No NLog `Logger` -- matching this repo's established "Instrumentation
 * isn't ported yet, so logging calls are dropped rather than routed
 * anywhere" convention (see e.g. parsingService.ts's doc comment). The
 * `_logger.Info("Found {0} extra files", extraFiles.Count)` call in the
 * real source is worth flagging as a PRESERVED UPSTREAM BUG though: that
 * `extraFiles` list is declared at the top of `Handle` and NEVER added to
 * anywhere in the method body (the per-importer `imported` results are
 * only used to build `importedFiles`, not accumulated into `extraFiles`) --
 * so the real Readarr log line always prints "Found 0 extra files"
 * regardless of what was actually imported. Preserved faithfully: this
 * port's equivalent internal variable is likewise always empty and never
 * used for anything the caller can observe (the return value doesn't
 * depend on it either -- `handle()` returns `void`, matching the C#).
 */
export interface ExistingExtraFileServiceOptions {
  /** Stand-in for the not-yet-ported `IDiskProvider.FolderExists`. */
  folderExists?: (path: string) => boolean;
  /** Stand-in for the not-yet-ported `IDiskScanService.GetNonBookFiles`. */
  getNonBookFiles?: (authorPath: string) => string[];
  /** Stand-in for the not-yet-ported `IDiskScanService.FilterPaths`. */
  filterPaths?: (authorPath: string, files: string[]) => string[];
}

export class ExistingExtraFileService {
  private readonly existingExtraFileImporters: IImportExistingExtraFiles[];
  private readonly folderExists: (path: string) => boolean;
  private readonly getNonBookFiles: (authorPath: string) => string[];
  private readonly filterPaths: (authorPath: string, files: string[]) => string[];

  constructor(
    existingExtraFileImporters: IImportExistingExtraFiles[],
    options: ExistingExtraFileServiceOptions = {}
  ) {
    this.existingExtraFileImporters = [...existingExtraFileImporters].sort(
      (a, b) => a.order - b.order
    );
    this.folderExists = options.folderExists ?? (() => false);
    this.getNonBookFiles = options.getNonBookFiles ?? (() => []);
    this.filterPaths = options.filterPaths ?? ((_authorPath, files) => files);
  }

  /** Ported from ExistingExtraFileService.Handle(AuthorScannedEvent message). */
  handle(message: AuthorScannedEvent): void {
    const author = message.author;

    if (!this.folderExists(author.path)) {
      return;
    }

    const filesOnDisk = this.getNonBookFiles(author.path);
    const possibleExtraFiles = this.filterPaths(author.path, filesOnDisk);

    const filteredFiles = possibleExtraFiles;
    const importedFiles: string[] = [];

    for (const existingExtraFileImporter of this.existingExtraFileImporters) {
      const imported = existingExtraFileImporter.processFiles(author, filteredFiles, importedFiles);

      importedFiles.push(...imported.map((f) => joinPath(author.path, f.relativePath)));
    }

    // Ported PRESERVED BUG: the real C# `extraFiles` list is declared but
    // never appended to, so this count is always 0. See module doc comment.
  }
}

/** Ported from `Path.Combine(author.Path, f.RelativePath)`. */
function joinPath(base: string, relative: string): string {
  if (base.endsWith("/") || base.endsWith("\\")) {
    return base + relative;
  }
  const sep = base.includes("\\") && !base.includes("/") ? "\\" : "/";
  return base + sep + relative;
}

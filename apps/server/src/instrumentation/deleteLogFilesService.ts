import { readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { DeleteLogFilesCommand, DeleteUpdateLogFilesCommand } from "./commands.js";

/**
 * Ported from NzbDrone.Core/Instrumentation/DeleteLogFilesService.cs.
 *
 * Constructor-injection deviation (same shape as
 * root-folders/root-folder-service.ts's documented deviation): the C#
 * constructor takes `IDiskProvider` (a ~40-method filesystem abstraction --
 * only a 4-method slice of it is ported so far, under root-folders/
 * disk-provider.ts, and it doesn't include `EmptyFolder`) and
 * `IAppFolderInfo` (`GetLogFolder()`/`GetUpdateLogFolder()` -- resolves
 * Readarr's app-data directory layout, not ported anywhere yet since
 * nothing before this module needed on-disk log/update-log folder paths).
 * Rather than block this service on porting either of those, the two
 * folder paths are passed in directly (the caller already knows its own
 * app-data layout) and the actual "empty this folder" side effect is an
 * injected `emptyFolder` function -- same shape as `IDiskProvider.
 * EmptyFolder(path)` -- defaulting to a real `fs`-based implementation so
 * this class is fully usable today without inventing a placeholder
 * IDiskProvider method that would need to be reconciled later.
 *
 * `Logger _logger` (`_logger.Debug(...)` before each delete) is the same
 * "Instrumentation not ported yet" gap this whole module exists to close --
 * but since DeleteLogFilesService itself lives inside Instrumentation, its
 * own debug-logging calls are dropped rather than routed through a
 * self-referential callback; nothing downstream depended on that debug
 * output (`SendUpdatesToClient` command UI just cares that the command
 * completed).
 */

/** Ported from `IDiskProvider.EmptyFolder(path)`: deletes every entry directly inside `path`, leaving `path` itself intact. */
export function emptyFolder(path: string): void {
  for (const entry of readdirSync(path)) {
    rmSync(join(path, entry), { recursive: true, force: true });
  }
}

export interface DeleteLogFilesServiceOptions {
  /** Ported from `IAppFolderInfo.GetLogFolder()`. */
  logFolder: string;
  /** Ported from `IAppFolderInfo.GetUpdateLogFolder()`. */
  updateLogFolder: string;
  /** Stand-in for `IDiskProvider.EmptyFolder(path)`. Defaults to a real filesystem implementation -- see module doc comment. */
  emptyFolder?: (path: string) => void;
}

export class DeleteLogFilesService {
  private readonly logFolder: string;
  private readonly updateLogFolder: string;
  private readonly emptyFolder: (path: string) => void;

  constructor(options: DeleteLogFilesServiceOptions) {
    this.logFolder = options.logFolder;
    this.updateLogFolder = options.updateLogFolder;
    this.emptyFolder = options.emptyFolder ?? emptyFolder;
  }

  /** Ported from `DeleteLogFilesService.Execute(DeleteLogFilesCommand message)`. */
  execute(_command: DeleteLogFilesCommand): void {
    this.emptyFolder(this.logFolder);
  }

  /** Ported from `DeleteLogFilesService.Execute(DeleteUpdateLogFilesCommand message)`. */
  executeUpdate(_command: DeleteUpdateLogFilesCommand): void {
    this.emptyFolder(this.updateLogFolder);
  }
}

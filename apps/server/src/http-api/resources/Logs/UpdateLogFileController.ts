import type { Router } from "express";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { logFileRouter } from "./LogFileModuleBase.js";

/**
 * Ported from Readarr.Api.V1/Logs/UpdateLogFileController.cs. Mounted at
 * `log/file/update` (`[V1ApiController("log/file/update")]`).
 *
 * `GetLogFiles()`: returns an empty list if the update log folder doesn't
 * exist (`!_diskProvider.FolderExists(...)`), otherwise every file in it
 * (non-recursive) whose filename matches `LOGFILE_ROUTE` (`^[-.a-zA-Z0-9]+
 * ?\.txt$`, case-insensitive -- `Regex.IsMatch(..., RegexOptions.IgnoreCase)`)
 * -- ported as `filenamePattern` below, applied at the LISTING level
 * (unlike `LogFileController`, which lists every file unfiltered; only
 * this controller's own `GetLogFiles()` override adds the filter, matching
 * the real source exactly). `resource` ctor arg is `"update"`.
 */
const UPDATE_LOGFILE_FILENAME_PATTERN = /^[-.a-zA-Z0-9]+?\.txt$/i;

export interface UpdateLogFileControllerOptions {
  getUpdateLogFolder: () => string;
  urlBase: string;
  onFlush?: () => void;
}

export function updateLogFileController(options: UpdateLogFileControllerOptions): Router {
  const { getUpdateLogFolder, urlBase, onFlush } = options;

  return logFileRouter({
    getLogFiles: () => listMatchingLogFiles(getUpdateLogFolder()),
    getLogFilePath: (filename) => join(getUpdateLogFolder(), filename),
    downloadUrlRoot: "updatelogfile",
    resource: "update",
    urlBase,
    ...(onFlush ? { onFlush } : {}),
  });
}

function listMatchingLogFiles(directory: string): string[] {
  if (!existsSync(directory)) {
    return [];
  }

  return readdirSync(directory, { withFileTypes: true })
    .filter((e) => e.isFile() && UPDATE_LOGFILE_FILENAME_PATTERN.test(e.name))
    .map((e) => join(directory, e.name));
}

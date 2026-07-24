import type { Router } from "express";
import { join } from "node:path";
import { logFileRouter, listLogFilesIn } from "./LogFileModuleBase.js";

/**
 * Ported from Readarr.Api.V1/Logs/LogFileController.cs. Mounted at
 * `log/file` (`[V1ApiController("log/file")]`).
 *
 * `GetLogFiles()`: `_diskProvider.GetFiles(_appFolderInfo.GetLogFolder(),
 * false)` -- every file directly inside the log folder (non-recursive, no
 * filename filtering by extension/pattern at this level; only the
 * per-file-download route itself is filename-constrained -- see
 * LogFileModuleBase.ts's doc comment). `resource` ctor arg is `""` (the
 * base class's `_resource` field, used to build `ContentsUrl` as
 * `/api/v1/{resource}/{filename}` -- an empty `resource` here produces
 * `/api/v1//{filename}`, a literal double-slash; this looks like a minor
 * real-source quirk, preserved as-is since it's the actual ctor argument
 * passed, matching `LogFileController`'s ctor: `base(diskProvider,
 * configFileProvider, "")`).
 */
export interface LogFileControllerOptions {
  getLogFolder: () => string;
  urlBase: string;
  onFlush?: () => void;
}

export function logFileController(options: LogFileControllerOptions): Router {
  const { getLogFolder, urlBase, onFlush } = options;

  return logFileRouter({
    getLogFiles: () => listLogFilesIn(getLogFolder()),
    getLogFilePath: (filename) => join(getLogFolder(), filename),
    downloadUrlRoot: "logfile",
    resource: "",
    urlBase,
    ...(onFlush ? { onFlush } : {}),
  });
}

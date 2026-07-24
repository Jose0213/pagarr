import { Router } from "express";
import { readdirSync, statSync, existsSync } from "node:fs";
import { basename, join } from "node:path";
import { stripDefaultId } from "../../rest/RestResource.js";
import type { LogFileResource } from "./LogFileResource.js";

/**
 * Ported from Readarr.Api.V1/Logs/LogFileModuleBase.cs (`LogFileControllerBase`).
 *
 * A shared base BOTH `LogFileController` (`log/file`) and
 * `UpdateLogFileController` (`log/file/update`) subclass in the real C#
 * source, overriding `GetLogFiles()`/`GetLogFilePath(filename)`/
 * `DownloadUrlRoot` for their respective log directories. Ported as a
 * factory function (`logFileRouter(options)`) taking those same three
 * "abstract member" slots as plain options -- the same
 * class-hierarchy-to-factory-function substitution this codebase uses
 * throughout `http-api/` (see RestController.ts's own doc comment for the
 * canonical statement of why).
 *
 * ## `LOGFILE_ROUTE` filename validation -- ported as an explicit guard,
 * not an Express route regex
 *
 * The real route (`[HttpGet(@"{filename:regex([[-.a-zA-Z0-9]]+?\.txt)}")]`)
 * constrains `filename` to `[-.a-zA-Z0-9]+?\.txt` AT THE ROUTING LAYER --
 * ASP.NET returns a routing-level 404 for anything that doesn't match
 * before the action method ever runs. Express's route-param syntax has no
 * direct equivalent for a per-segment regex constraint this specific
 * (`router.get("/:filename([-.a-zA-Z0-9]+\\.txt)")` IS supported by
 * Express's path-to-regexp, and is used here for parity -- see
 * `FILENAME_PARAM_PATTERN` below), so this ports the constraint as an
 * actual Express route-param regex, matching the real behavior (non-conforming
 * paths simply don't match this route at all, falling through to Express's
 * own 404, not a 400/`BadRequestException`).
 *
 * The restricted character class (`-`, `.`, alphanumerics only -- no `/`,
 * no `..` as a standalone traversal token since `.` alone or repeated is
 * still just a literal char within a single path SEGMENT under Express's
 * default non-greedy single-segment param matching) makes path traversal
 * structurally unreachable through this param the same way it was in the
 * real ASP.NET route -- ported for the SAME safety property the original
 * had, not as new defense-in-depth this port invented.
 *
 * `LogManager.Flush()` (NLog's own "flush any buffered log writes to disk
 * before reading files back" call, so a just-written line isn't missed by
 * a concurrent read) has no port here -- no NLog instance exists in this
 * repo (this port's established no-NLog-yet convention, see
 * config/configService.ts's doc comment); `onFlush` is exposed as an
 * optional callback a caller can wire to whatever logging sink this port
 * eventually uses, defaulting to a no-op.
 */
export interface LogFileRouterOptions {
  /** Ported from `GetLogFiles()`: the full list of log file paths in this controller's directory. */
  getLogFiles: () => string[];
  /** Ported from `GetLogFilePath(filename)`. */
  getLogFilePath: (filename: string) => string;
  /** Ported from the `DownloadUrlRoot` abstract property. */
  downloadUrlRoot: string;
  /** Ported from the ctor's `resource` parameter (`""` for LogFileController, `"update"` for UpdateLogFileController) -- used to build `ContentsUrl`. */
  resource: string;
  /** `IConfigFileProvider.UrlBase` -- see module doc comment on `ContentsUrl`/`DownloadUrl`. */
  urlBase: string;
  /** Stand-in for `LogManager.Flush()`. See module doc comment. */
  onFlush?: () => void;
}

/** Express route-param regex for the real `LOGFILE_ROUTE` constraint -- see module doc comment. */
const FILENAME_PARAM_PATTERN = "[-.a-zA-Z0-9]+\\.txt";

export function logFileRouter(options: LogFileRouterOptions): Router {
  const { getLogFiles, getLogFilePath, downloadUrlRoot, resource, urlBase, onFlush } = options;
  const router = Router();

  // Ported from `GetLogFilesResponse()`.
  router.get("/", (_req, res) => {
    const files = getLogFiles();

    const result: LogFileResource[] = files.map((file, i) => {
      const filename = basename(file);
      let lastWriteTime: Date;
      try {
        lastWriteTime = statSync(file).mtime;
      } catch {
        lastWriteTime = new Date(0);
      }

      return {
        id: i + 1,
        filename,
        lastWriteTime: lastWriteTime.toISOString(),
        contentsUrl: `${urlBase}/api/v1/${resource}/${filename}`,
        downloadUrl: `${urlBase}/${downloadUrlRoot}/${filename}`,
      };
    });

    // Ported from `.OrderByDescending(l => l.LastWriteTime)`.
    result.sort((a, b) => Date.parse(b.lastWriteTime) - Date.parse(a.lastWriteTime));

    res.json(result.map(stripDefaultId));
  });

  // Ported from `GetLogFileResponse(string filename)`. Route-param regex
  // constraint enforces the same filename shape ASP.NET's route did -- see
  // module doc comment.
  router.get(`/:filename(${FILENAME_PARAM_PATTERN})`, (req, res) => {
    onFlush?.();

    const filePath = getLogFilePath(req.params["filename"]!);

    if (!existsSync(filePath)) {
      res.status(404).end();
      return;
    }

    res.type("text/plain").sendFile(filePath);
  });

  return router;
}

/**
 * Small helper both `LogFileController`/`UpdateLogFileController` use for
 * their `GetLogFiles()` override: non-recursive file listing of a
 * directory, silently returning an empty list if the directory doesn't
 * exist (matches `UpdateLogFileController`'s own explicit
 * `!_diskProvider.FolderExists(...)` guard; `LogFileController`'s own
 * `GetLogFolder()` is assumed to always exist by the real source, but an
 * empty-list fallback here is a strictly safer superset of that
 * assumption, not a behavior change for the case that DOES exist).
 */
export function listLogFilesIn(directory: string): string[] {
  if (!existsSync(directory)) {
    return [];
  }

  return readdirSync(directory, { withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => join(directory, e.name));
}

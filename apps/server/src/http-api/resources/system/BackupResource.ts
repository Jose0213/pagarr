import { createHash } from "node:crypto";
import { join, extname } from "node:path";
import { Router, raw, type Request, type Response, type NextFunction } from "express";
import { BackupType, type Backup } from "../../../backup/backup.js";
import type { IBackupService } from "../../../backup/backupService.js";
import { BadRequestException } from "../../rest/BadRequestException.js";
import { NotFoundException } from "../../rest/NotFoundException.js";
import { UnsupportedMediaTypeException } from "../../rest/UnsupportedMediaTypeException.js";
import type { RestResource } from "../../rest/RestResource.js";
import { parseFirstMultipartFile, parseMultipartBoundary } from "./multipartFile.js";

/**
 * Ported from Readarr.Api.V1/System/Backup/{BackupResource,
 * BackupController}.cs. Mount path (per `[V1ApiController("system/backup")]`):
 * `/api/v1/system/backup`.
 *
 * Wraps the REAL, already-ported `backup/` module (`IBackupService`,
 * `backup/backupService.ts`) -- not a forward-ref. `IDiskProvider`/
 * `IAppFolderInfo` are narrowed to the exact two calls this controller
 * makes (`FileExists`/`DeleteFile`/`SaveStream` and `TempFolder`), matching
 * the disk-provider narrowing convention used throughout the backup module
 * itself (see backup/backupDiskProvider.ts's own doc comment on why this
 * repo has several independent narrow `IDiskProvider` slices rather than
 * one shared import).
 *
 * ## `GetBackupId` / faithful id derivation
 *
 * Backup files have no real numeric id (they're just files on disk); the
 * real controller derives a stable one via `HashConverter.GetHashInt31
 * ($"backup-{backup.Type}-{backup.Name}")`. This port re-derives
 * `GetHashInt31` locally (SHA-1, first 4 bytes little-endian int32, masked
 * to 31 bits) -- the same local re-derivation this codebase's other
 * `HashConverter.GetHashInt31` call sites use (see e.g.
 * download-tracking/pending/pendingReleaseService.ts's identical helper),
 * rather than importing any one of them cross-module.
 *
 * ## File upload: no multipart-parsing dependency
 *
 * `POST .../restore/upload` needs the raw request body as a `Buffer`
 * (multipart parsed by ./multipartFile.ts, see that file's doc comment for
 * why no multer/formidable dependency was added) rather than JSON --
 * `uploadAndRestoreRouter` mounts `express.raw({ type: "multipart/form-data",
 * limit: "1gb" })` (ported from the real route's own
 * `[RequestFormLimits(MultipartBodyLengthLimit = 1000000000)]`) SCOPED TO
 * ITS OWN ROUTE ONLY, ahead of the app-wide `express.json()` a caller's
 * composition root mounts before this router -- Express runs body parsers
 * in registration order and only the first one whose `type` matches the
 * request's Content-Type actually consumes the body, so per-route
 * `express.raw(...)` here does not interfere with every other route's JSON
 * parsing.
 */
export interface BackupControllerDeps {
  backupService: IBackupService;
  diskProvider: {
    fileExists(path: string): boolean;
    deleteFile(path: string): void;
    writeFile(path: string, data: Buffer): void;
  };
  appFolderInfo: {
    tempFolder: string;
  };
}

export interface BackupResource extends RestResource {
  name: string;
  path: string;
  type: BackupType;
  size: number;
  /** ISO-8601 timestamp string (C# `DateTime`). */
  time: string;
}

/** Ported from `HashConverter.GetHashInt31(string target)` -- see this codebase's other local re-derivations (e.g. pendingReleaseService.ts) for the identical algorithm. */
function getHashInt31(target: string): number {
  const hash = createHash("sha1").update(target, "latin1").digest();
  return hash.readInt32LE(0) & 0x7fffffff;
}

/** Ported from BackupController.GetBackupId(Backup). */
function getBackupId(backup: Backup): number {
  return getHashInt31(`backup-${backup.type}-${backup.name}`);
}

/** Ported from BackupController's `b.Type.ToString().ToLower()` in the resource's Path field -- BackupType's string names, matching backup/backup.ts's enum member names lowercased. NOTE: `BackupType` (backup/backup.ts) is a NUMERIC TS enum (`Scheduled = 0`, `Manual = 1`, `Update = 2`), so `String(type)` on the numeric value itself would stringify to a digit ("1"), NOT the member name -- this uses the enum's own reverse numeric-to-name mapping (`BackupType[type]`, which TS numeric enums generate automatically) to get "Manual"/"Scheduled"/"Update" the way C#'s `Enum.ToString()` does. */
function backupTypeName(type: BackupType): string {
  return BackupType[type].toLowerCase();
}

function toBackupResource(backup: Backup): BackupResource {
  return {
    id: getBackupId(backup),
    name: backup.name,
    path: `/backup/${backupTypeName(backup.type)}/${backup.name}`,
    type: backup.type,
    size: backup.size,
    time: backup.time,
  };
}

/** Ported from `BackupController.ValidExtensions`. */
const VALID_EXTENSIONS = [".zip", ".db", ".xml"];

function asyncHandler(
  fn: (req: Request, res: Response) => void | Promise<void>
): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    Promise.resolve(fn(req, res)).catch(next);
  };
}

/** Ported from BackupController's private `GetBackup(int id)`: finds the backup whose derived id matches, or undefined (the route handlers throw NotFoundException when this misses -- matching the real `SingleOrDefault` + `if (backup == null)` checks). */
function findBackup(deps: BackupControllerDeps, id: number): Backup | undefined {
  return deps.backupService.getBackups().find((b) => getBackupId(b) === id);
}

function getBackupPath(deps: BackupControllerDeps, backup: Backup): string {
  return join(deps.backupService.getBackupFolder(backup.type), backup.name);
}

export function backupController(deps: BackupControllerDeps): Router {
  const router = Router();

  // Ported from `GetBackupFiles()`: `OrderByDescending(b => b.Time)`.
  router.get(
    "/",
    asyncHandler((_req, res) => {
      const backups = deps.backupService
        .getBackups()
        .map(toBackupResource)
        .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());

      res.json(backups);
    })
  );

  // Ported from `[RestDeleteById] DeleteBackup(int id)`.
  router.delete(
    "/:id",
    asyncHandler((req, res) => {
      const id = Number.parseInt(req.params["id"] ?? "", 10);
      const backup = findBackup(deps, id);

      if (!backup) {
        throw new NotFoundException();
      }

      const path = getBackupPath(deps, backup);

      if (!deps.diskProvider.fileExists(path)) {
        throw new NotFoundException();
      }

      deps.diskProvider.deleteFile(path);

      res.json({});
    })
  );

  // Ported from `[HttpPost("restore/upload")]` +
  // `[RequestFormLimits(MultipartBodyLengthLimit = 1000000000)]`. Scoped
  // `raw()` body parser -- see module doc comment. MUST be registered
  // before `/restore/:id` below: ASP.NET's attribute routing always
  // prefers the literal "restore/upload" template over the
  // constrained-parameter "restore/{id:int}" one regardless of declaration
  // order (and "upload" wouldn't even match the `{id:int}` constraint), but
  // Express matches routes strictly in registration order -- mounting
  // `/restore/:id` first would otherwise swallow this route as if it were
  // `/restore/:id` with `id="upload"`. Same class of ordering bug as
  // NamingConfigResource.ts's `/examples` route -- see that file's doc
  // comment for the identical issue, caught here the same way (this
  // module's own test suite failed until this was reordered).
  router.post(
    "/restore/upload",
    raw({ type: "multipart/form-data", limit: "1gb" }),
    asyncHandler(async (req, res) => {
      if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
        throw new BadRequestException("file must be provided");
      }

      const boundary = parseMultipartBoundary(req.headers["content-type"]);
      const file = boundary ? parseFirstMultipartFile(req.body, boundary) : null;

      if (!file) {
        throw new BadRequestException("file must be provided");
      }

      const extension = extname(file.fileName);

      if (!VALID_EXTENSIONS.includes(extension)) {
        throw new UnsupportedMediaTypeException(
          `Invalid extension, must be one of: ${VALID_EXTENSIONS.join(", ")}`
        );
      }

      const path = join(deps.appFolderInfo.tempFolder, `readarr_backup_restore${extension}`);

      deps.diskProvider.writeFile(path, file.data);
      deps.backupService.restore(path);

      // Ported: "Cleanup restored file".
      deps.diskProvider.deleteFile(path);

      res.json({ restartRequired: true });
    })
  );

  // Ported from `[HttpPost("restore/{id:int}")] Restore(int id)`.
  router.post(
    "/restore/:id",
    asyncHandler(async (req, res) => {
      const id = Number.parseInt(req.params["id"] ?? "", 10);
      const backup = findBackup(deps, id);

      if (!backup) {
        throw new NotFoundException();
      }

      const path = getBackupPath(deps, backup);

      deps.backupService.restore(path);

      res.json({ restartRequired: true });
    })
  );

  return router;
}

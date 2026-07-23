import { join, basename } from "node:path";
import type { MainDatabase } from "../db/db-factory.js";
import { DatabaseType } from "../db/database.js";
import type { IExecute } from "../messaging/commands/iExecute.js";
import type { IBackupArchiveService } from "./backupArchiveService.js";
import type { IAppFolderInfo, IBackupDiskProvider } from "./backupDiskProvider.js";
import type { IMakeDatabaseBackup } from "./makeDatabaseBackup.js";
import { BackupType, type Backup } from "./backup.js";
import type { BackupCommand } from "./backupCommand.js";
import { RestoreBackupFailedException } from "./restoreBackupFailedException.js";

/** Ported from `System.Net.HttpStatusCode.NotFound` (404), the status code `Restore()` throws `RestoreBackupFailedException` with. */
const HTTP_STATUS_NOT_FOUND = 404;

export interface BackupServiceConfig {
  readonly backupFolder: string;
  readonly backupRetention: number;
}

export interface BackupServiceLogger {
  progressInfo(message: string): void;
  progressDebug(message: string): void;
  debug(message: string, ...args: unknown[]): void;
}

const noopLogger: BackupServiceLogger = {
  progressInfo: () => {},
  progressDebug: () => {},
  debug: () => {},
};

/**
 * Ported from NzbDrone.Core/Backup/BackupService.cs.
 *
 * ## Dependencies
 *
 * `IMainDatabase` is the REAL, already-merged `MainDatabase` (db/
 * db-factory.ts) -- not a forward-ref, per this module's task instructions.
 * `IMakeDatabaseBackup`/`IArchiveService`/`IDiskProvider`/`IAppFolderInfo`
 * are local forward-refs (see makeDatabaseBackup.ts/backupArchiveService.ts/
 * backupDiskProvider.ts's own doc comments -- none of these Common-layer
 * interfaces are owned by any already-merged module). `IConfigService` is
 * narrowed to just `backupFolder`/`backupRetention` (the two fields this
 * class reads) rather than importing the full real `config/configService.ts`
 * `IConfigService` -- structurally compatible with it (a real
 * `IConfigService` satisfies `BackupServiceConfig` as-is), so a caller can
 * pass the real config service directly without an adapter.
 *
 * ## `Logger.ProgressInfo`/`ProgressDebug`
 *
 * C#'s `NzbDrone.Common.Instrumentation.Extensions.ProgressLogger`
 * extension methods (`ProgressInfo`/`ProgressDebug`) attach the "Status"
 * structured property `progress-messaging/progressMessageTarget.ts` reads
 * (see that module's own doc comment) -- not ported as a real extension
 * method here (no NLog layer to extend), but `BackupServiceLogger`'s
 * `progressInfo`/`progressDebug` method names preserve the call-site shape
 * so a real logger implementation can wire the "Status" property through
 * when NLog (or an equivalent) lands.
 *
 * ## Async
 *
 * `Backup()`/`Execute()` are `async` here (unlike the C# original's fully
 * synchronous methods) because `IMakeDatabaseBackup.backupDatabase()` uses
 * `node:sqlite`'s native async `backup()` API (see that file's doc
 * comment) -- every other step keeps the exact same synchronous ordering
 * the C# source has, just awaited in sequence rather than blocking.
 */
export interface IBackupService {
  backup(backupType: BackupType): Promise<void>;
  getBackups(): Backup[];
  restore(backupFileName: string): void;
  getBackupFolder(backupType?: BackupType): string;
}

/** Ported from `BackupService.BackupFileRegex` -- static readonly Regex, case-insensitive. */
export const BACKUP_FILE_REGEX = /readarr_backup_(v[0-9.]+_)?[._0-9]+\.zip/i;

export class BackupService implements IBackupService, IExecute<BackupCommand> {
  private readonly backupTempFolder: string;

  constructor(
    private readonly mainDb: MainDatabase,
    private readonly mainDbPath: string,
    private readonly makeDatabaseBackup: IMakeDatabaseBackup,
    private readonly diskProvider: IBackupDiskProvider,
    private readonly appFolderInfo: IAppFolderInfo,
    private readonly archiveService: IBackupArchiveService,
    private readonly configService: BackupServiceConfig,
    private readonly appVersion: string,
    private readonly logger: BackupServiceLogger = noopLogger
  ) {
    this.backupTempFolder = join(this.appFolderInfo.tempFolder, "readarr_backup");
  }

  async backup(backupType: BackupType): Promise<void> {
    this.logger.progressInfo("Starting Backup");

    const backupFolder = this.getBackupFolder(backupType);

    this.diskProvider.ensureFolder(this.backupTempFolder);
    this.diskProvider.ensureFolder(backupFolder);

    if (!this.diskProvider.folderWritable(backupFolder)) {
      throw new Error(`Backup folder ${backupFolder} is not writable`);
    }

    const dateNow = new Date();
    const backupFilename = `readarr_backup_v${this.appVersion}_${formatBackupTimestamp(dateNow)}.zip`;
    const backupPath = join(backupFolder, backupFilename);

    this.cleanup();

    if (backupType !== BackupType.Manual) {
      this.cleanupOldBackups(backupType);
    }

    this.backupConfigFile();
    await this.backupDatabase();
    this.createVersionInfo(dateNow);

    this.logger.progressDebug("Creating backup zip");

    // Delete journal file created during database backup
    this.diskProvider.deleteFile(
      join(this.backupTempFolder, `${basename(this.mainDbPath)}-journal`)
    );

    this.archiveService.createZip(
      backupPath,
      this.diskProvider.getFiles(this.backupTempFolder, false)
    );

    this.cleanup();

    this.logger.progressDebug("Backup zip created");
  }

  getBackups(): Backup[] {
    const backups: Backup[] = [];

    for (const backupType of [BackupType.Scheduled, BackupType.Manual, BackupType.Update]) {
      const folder = this.getBackupFolder(backupType);

      if (this.diskProvider.folderExists(folder)) {
        for (const file of this.getBackupFiles(folder)) {
          backups.push({
            name: basename(file),
            type: backupType,
            size: this.diskProvider.getFileSize(file),
            time: this.diskProvider.fileGetLastWrite(file).toISOString(),
          });
        }
      }
    }

    return backups;
  }

  restore(backupFileName: string): void {
    if (backupFileName.endsWith(".zip")) {
      let restoredFile = false;
      const temporaryPath = join(this.appFolderInfo.tempFolder, "readarr_backup_restore");

      this.archiveService.extract(backupFileName, temporaryPath);

      for (const file of this.diskProvider.getFiles(temporaryPath, false)) {
        const fileName = basename(file);

        if (fileName.toLowerCase() === "config.xml") {
          this.diskProvider.moveFile(file, this.appFolderInfo.getConfigPath(), true);
          restoredFile = true;
        }

        if (fileName.toLowerCase() === basename(this.mainDbPath).toLowerCase()) {
          this.diskProvider.moveFile(file, this.appFolderInfo.getDatabaseRestore(), true);
          restoredFile = true;
        }
      }

      if (!restoredFile) {
        throw new RestoreBackupFailedException(
          HTTP_STATUS_NOT_FOUND,
          "Unable to restore database file from backup"
        );
      }

      this.diskProvider.deleteFolder(temporaryPath, true);

      return;
    }

    this.diskProvider.moveFile(backupFileName, this.appFolderInfo.getDatabaseRestore(), true);
  }

  getBackupFolder(backupType?: BackupType): string {
    if (backupType === undefined) {
      const backupFolder = this.configService.backupFolder;

      if (isRootedPath(backupFolder)) {
        return backupFolder;
      }

      return join(this.appFolderInfo.getAppDataPath(), backupFolder);
    }

    return join(this.getBackupFolder(), BackupType[backupType].toLowerCase());
  }

  private cleanup(): void {
    if (this.diskProvider.folderExists(this.backupTempFolder)) {
      this.diskProvider.emptyFolder(this.backupTempFolder);
    }
  }

  private async backupDatabase(): Promise<void> {
    if (this.mainDb.databaseType === DatabaseType.SQLite) {
      this.logger.progressDebug("Backing up database");

      await this.makeDatabaseBackup.backupDatabase(
        this.mainDb,
        this.backupTempFolder,
        this.mainDbPath
      );
    }
  }

  private backupConfigFile(): void {
    this.logger.progressDebug("Backing up config.xml");

    const configFile = this.appFolderInfo.getConfigPath();
    const tempConfigFile = join(this.backupTempFolder, basename(configFile));

    this.diskProvider.copyFile(configFile, tempConfigFile);
  }

  private createVersionInfo(dateNow: Date): void {
    const tempFile = join(this.backupTempFolder, "INFO");

    const lines = [`v${this.appVersion}`, formatVersionInfoTimestamp(dateNow)];

    this.diskProvider.writeAllText(tempFile, lines.join("\n") + "\n");
  }

  private cleanupOldBackups(backupType: BackupType): void {
    const retention = this.configService.backupRetention;

    this.logger.debug("Cleaning up backup files older than %d days", retention);
    const files = this.getBackupFiles(this.getBackupFolder(backupType));

    for (const file of files) {
      const lastWriteTime = this.diskProvider.fileGetLastWrite(file);

      // Ported from `if (lastWriteTime.AddDays(retention) < DateTime.UtcNow)`.
      const expiresAt = lastWriteTime.getTime() + retention * 24 * 60 * 60 * 1000;

      if (expiresAt < Date.now()) {
        this.logger.debug("Deleting old backup file: %s", file);
        this.diskProvider.deleteFile(file);
      }
    }

    this.logger.debug("Finished cleaning up old backup files");
  }

  private getBackupFiles(path: string): string[] {
    const files = this.diskProvider.getFiles(path, false);

    return files.filter((f) => BACKUP_FILE_REGEX.test(basename(f)));
  }

  async execute(message: BackupCommand): Promise<void> {
    await this.backup(message.type);
  }
}

/**
 * Ported from `Path.IsPathRooted(backupFolder)`. .NET's `IsPathRooted`
 * considers both `C:\foo` (drive-rooted) and `\foo`/`/foo`
 * (root-of-current-drive-rooted, Windows) or a leading `/` (POSIX) as
 * rooted -- ported as a check for a POSIX-absolute leading slash OR a
 * Windows drive-letter/UNC prefix, matching the C# runtime's own
 * cross-platform behavior for this exact call (BackupService always runs
 * against whatever OS the app is deployed to, and `Path.IsPathRooted`'s
 * behavior is itself platform-dependent in .NET -- this mirrors both
 * platform's rooted-path shapes rather than picking one).
 */
function isRootedPath(path: string): boolean {
  return /^([a-zA-Z]:[\\/]|[\\/]|\\\\)/.test(path);
}

/** Ported from `$"{dateNow:yyyy.MM.dd_HH.mm.ss}"` -- local time, matching `DateTime.Now` (not `.UtcNow`) in the C# source. */
function formatBackupTimestamp(date: Date): string {
  const pad = (n: number): string => String(n).padStart(2, "0");
  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())}_${pad(date.getHours())}.${pad(date.getMinutes())}.${pad(date.getSeconds())}`;
}

/** Ported from `$"{dateNow:yyyy-MM-dd HH:mm:ss}"` (INFO file's second line). */
function formatVersionInfoTimestamp(date: Date): string {
  const pad = (n: number): string => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

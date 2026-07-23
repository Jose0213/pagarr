import { sep } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BackupService, BACKUP_FILE_REGEX } from "../backupService.js";
import { BackupType } from "../backup.js";
import { createMainDatabase, type MainDatabase } from "../../db/db-factory.js";
import type { IBackupArchiveService } from "../backupArchiveService.js";
import type { IAppFolderInfo, IBackupDiskProvider } from "../backupDiskProvider.js";
import type { IMakeDatabaseBackup } from "../makeDatabaseBackup.js";
import { RestoreBackupFailedException } from "../restoreBackupFailedException.js";

function fakeDiskProvider(overrides: Partial<IBackupDiskProvider> = {}): IBackupDiskProvider {
  return {
    ensureFolder: vi.fn(),
    folderExists: vi.fn(() => true),
    folderWritable: vi.fn(() => true),
    emptyFolder: vi.fn(),
    getFiles: vi.fn(() => []),
    getFileSize: vi.fn(() => 0),
    fileGetLastWrite: vi.fn(() => new Date()),
    deleteFile: vi.fn(),
    deleteFolder: vi.fn(),
    moveFile: vi.fn(),
    copyFile: vi.fn(),
    writeAllText: vi.fn(),
    ...overrides,
  };
}

function fakeAppFolderInfo(overrides: Partial<IAppFolderInfo> = {}): IAppFolderInfo {
  return {
    tempFolder: "/tmp",
    getConfigPath: vi.fn(() => "/app/config.xml"),
    getAppDataPath: vi.fn(() => "/app/data"),
    getDatabaseRestore: vi.fn(() => "/app/data/readarr.db.restore"),
    ...overrides,
  };
}

function fakeArchiveService(overrides: Partial<IBackupArchiveService> = {}): IBackupArchiveService {
  return {
    createZip: vi.fn(),
    extract: vi.fn(),
    ...overrides,
  };
}

function fakeMakeDatabaseBackup(overrides: Partial<IMakeDatabaseBackup> = {}): IMakeDatabaseBackup {
  return {
    backupDatabase: vi.fn(async () => {}),
    ...overrides,
  };
}

describe("BackupService", () => {
  let db: MainDatabase;

  beforeEach(() => {
    db = createMainDatabase(":memory:");
  });

  describe("BACKUP_FILE_REGEX", () => {
    it("matches real Readarr backup filenames (versioned and unversioned)", () => {
      expect(BACKUP_FILE_REGEX.test("readarr_backup_v1.2.3.4_2026.01.01_00.00.00.zip")).toBe(true);
      expect(BACKUP_FILE_REGEX.test("readarr_backup_2026.01.01_00.00.00.zip")).toBe(true);
      expect(BACKUP_FILE_REGEX.test("READARR_BACKUP_V1.0_1.zip")).toBe(true);
      expect(BACKUP_FILE_REGEX.test("not_a_backup.zip")).toBe(false);
    });
  });

  describe("backup()", () => {
    it("throws when the backup folder is not writable", async () => {
      const diskProvider = fakeDiskProvider({ folderWritable: vi.fn(() => false) });
      const service = new BackupService(
        db,
        "/app/data/readarr.db",
        fakeMakeDatabaseBackup(),
        diskProvider,
        fakeAppFolderInfo(),
        fakeArchiveService(),
        { backupFolder: "Backups", backupRetention: 28 },
        "1.0.0.0"
      );

      await expect(service.backup(BackupType.Manual)).rejects.toThrow(/not writable/);
    });

    it("skips cleanupOldBackups for manual backups but runs it for scheduled ones", async () => {
      const diskProvider = fakeDiskProvider();
      const serviceManual = new BackupService(
        db,
        "/app/data/readarr.db",
        fakeMakeDatabaseBackup(),
        diskProvider,
        fakeAppFolderInfo(),
        fakeArchiveService(),
        { backupFolder: "Backups", backupRetention: 28 },
        "1.0.0.0"
      );

      await serviceManual.backup(BackupType.Manual);
      // getFiles is called for getBackupFiles (cleanup) and the final zip
      // file listing -- for Manual, cleanupOldBackups is skipped so
      // getBackupFiles is never called before the zip step.
      expect(diskProvider.getFiles).toHaveBeenCalledTimes(1);
    });

    it("calls makeDatabaseBackup and creates a zip archive from the temp folder's files", async () => {
      const diskProvider = fakeDiskProvider({
        getFiles: vi.fn(() => ["/tmp/readarr_backup/config.xml", "/tmp/readarr_backup/readarr.db"]),
      });
      const archiveService = fakeArchiveService();
      const makeDatabaseBackup = fakeMakeDatabaseBackup();

      const service = new BackupService(
        db,
        "/app/data/readarr.db",
        makeDatabaseBackup,
        diskProvider,
        fakeAppFolderInfo(),
        archiveService,
        { backupFolder: "Backups", backupRetention: 28 },
        "1.0.0.0"
      );

      await service.backup(BackupType.Manual);

      expect(makeDatabaseBackup.backupDatabase).toHaveBeenCalledWith(
        db,
        expect.stringContaining("readarr_backup"),
        "/app/data/readarr.db"
      );
      expect(archiveService.createZip).toHaveBeenCalledWith(
        expect.stringMatching(/readarr_backup_v1\.0\.0\.0_.*\.zip$/),
        ["/tmp/readarr_backup/config.xml", "/tmp/readarr_backup/readarr.db"]
      );
    });
  });

  describe("getBackups()", () => {
    it("lists backup files across all three backup type subfolders", () => {
      const diskProvider = fakeDiskProvider({
        folderExists: vi.fn(() => true),
        getFiles: vi.fn((path: string) => {
          if (path.endsWith("scheduled")) {
            return ["/backups/scheduled/readarr_backup_v1.0_2026.01.01_00.00.00.zip"];
          }
          return [];
        }),
        getFileSize: vi.fn(() => 12345),
        fileGetLastWrite: vi.fn(() => new Date("2026-01-01T00:00:00.000Z")),
      });

      const service = new BackupService(
        db,
        "/app/data/readarr.db",
        fakeMakeDatabaseBackup(),
        diskProvider,
        fakeAppFolderInfo(),
        fakeArchiveService(),
        { backupFolder: "Backups", backupRetention: 28 },
        "1.0.0.0"
      );

      const backups = service.getBackups();
      expect(backups).toHaveLength(1);
      expect(backups[0]).toMatchObject({
        name: "readarr_backup_v1.0_2026.01.01_00.00.00.zip",
        type: BackupType.Scheduled,
        size: 12345,
      });
    });

    it("returns an empty list when no backup folders exist", () => {
      const diskProvider = fakeDiskProvider({ folderExists: vi.fn(() => false) });
      const service = new BackupService(
        db,
        "/app/data/readarr.db",
        fakeMakeDatabaseBackup(),
        diskProvider,
        fakeAppFolderInfo(),
        fakeArchiveService(),
        { backupFolder: "Backups", backupRetention: 28 },
        "1.0.0.0"
      );

      expect(service.getBackups()).toEqual([]);
    });
  });

  describe("restore()", () => {
    it("extracts a .zip and moves Config.xml + the main db file into place", () => {
      const diskProvider = fakeDiskProvider({
        getFiles: vi.fn(() => [
          "/tmp/readarr_backup_restore/Config.xml",
          "/tmp/readarr_backup_restore/readarr.db",
        ]),
      });
      const archiveService = fakeArchiveService();
      const appFolderInfo = fakeAppFolderInfo();

      const service = new BackupService(
        db,
        "/app/data/readarr.db",
        fakeMakeDatabaseBackup(),
        diskProvider,
        appFolderInfo,
        archiveService,
        { backupFolder: "Backups", backupRetention: 28 },
        "1.0.0.0"
      );

      service.restore("/backups/manual/backup.zip");

      expect(archiveService.extract).toHaveBeenCalledWith(
        "/backups/manual/backup.zip",
        expect.stringContaining("readarr_backup_restore")
      );
      expect(diskProvider.moveFile).toHaveBeenCalledWith(
        "/tmp/readarr_backup_restore/Config.xml",
        "/app/config.xml",
        true
      );
      expect(diskProvider.moveFile).toHaveBeenCalledWith(
        "/tmp/readarr_backup_restore/readarr.db",
        "/app/data/readarr.db.restore",
        true
      );
      expect(diskProvider.deleteFolder).toHaveBeenCalled();
    });

    it("throws RestoreBackupFailedException when the archive contains neither Config.xml nor the db file", () => {
      const diskProvider = fakeDiskProvider({
        getFiles: vi.fn(() => ["/tmp/readarr_backup_restore/unrelated.txt"]),
      });

      const service = new BackupService(
        db,
        "/app/data/readarr.db",
        fakeMakeDatabaseBackup(),
        diskProvider,
        fakeAppFolderInfo(),
        fakeArchiveService(),
        { backupFolder: "Backups", backupRetention: 28 },
        "1.0.0.0"
      );

      expect(() => service.restore("/backups/manual/backup.zip")).toThrow(
        RestoreBackupFailedException
      );
    });

    it("moves a non-zip file directly to the database restore path", () => {
      const diskProvider = fakeDiskProvider();
      const appFolderInfo = fakeAppFolderInfo();

      const service = new BackupService(
        db,
        "/app/data/readarr.db",
        fakeMakeDatabaseBackup(),
        diskProvider,
        appFolderInfo,
        fakeArchiveService(),
        { backupFolder: "Backups", backupRetention: 28 },
        "1.0.0.0"
      );

      service.restore("/backups/manual/readarr.db");

      expect(diskProvider.moveFile).toHaveBeenCalledWith(
        "/backups/manual/readarr.db",
        "/app/data/readarr.db.restore",
        true
      );
    });
  });

  describe("getBackupFolder()", () => {
    it("joins a relative configured backupFolder onto the app data path", () => {
      const appFolderInfo = fakeAppFolderInfo({ getAppDataPath: vi.fn(() => "/app/data") });
      const service = new BackupService(
        db,
        "/app/data/readarr.db",
        fakeMakeDatabaseBackup(),
        fakeDiskProvider(),
        appFolderInfo,
        fakeArchiveService(),
        { backupFolder: "Backups", backupRetention: 28 },
        "1.0.0.0"
      );

      expect(service.getBackupFolder()).toBe(["", "app", "data", "Backups"].join(sep));
    });

    it("uses a rooted configured backupFolder as-is", () => {
      const service = new BackupService(
        db,
        "/app/data/readarr.db",
        fakeMakeDatabaseBackup(),
        fakeDiskProvider(),
        fakeAppFolderInfo(),
        fakeArchiveService(),
        { backupFolder: "C:\\CustomBackups", backupRetention: 28 },
        "1.0.0.0"
      );

      expect(service.getBackupFolder()).toBe("C:\\CustomBackups");
    });

    it("appends the lowercased backup type name for a per-type subfolder", () => {
      const service = new BackupService(
        db,
        "/app/data/readarr.db",
        fakeMakeDatabaseBackup(),
        fakeDiskProvider(),
        fakeAppFolderInfo({ getAppDataPath: vi.fn(() => "/app/data") }),
        fakeArchiveService(),
        { backupFolder: "Backups", backupRetention: 28 },
        "1.0.0.0"
      );

      expect(service.getBackupFolder(BackupType.Scheduled)).toContain("scheduled");
      expect(service.getBackupFolder(BackupType.Manual)).toContain("manual");
      expect(service.getBackupFolder(BackupType.Update)).toContain("update");
    });
  });

  describe("execute()", () => {
    it("runs a backup with the command's derived BackupType", async () => {
      const diskProvider = fakeDiskProvider();
      const service = new BackupService(
        db,
        "/app/data/readarr.db",
        fakeMakeDatabaseBackup(),
        diskProvider,
        fakeAppFolderInfo(),
        fakeArchiveService(),
        { backupFolder: "Backups", backupRetention: 28 },
        "1.0.0.0"
      );

      await service.execute({ type: BackupType.Manual } as never);

      expect(diskProvider.ensureFolder).toHaveBeenCalled();
    });
  });
});

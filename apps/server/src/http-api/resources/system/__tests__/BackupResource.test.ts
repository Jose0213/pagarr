import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { BackupType, type Backup } from "../../../../backup/backup.js";
import type { IBackupService } from "../../../../backup/backupService.js";
import { readarrErrorPipeline } from "../../../error-management/ReadarrErrorPipeline.js";
import { backupController, type BackupControllerDeps } from "../BackupResource.js";

function makeBackup(overrides: Partial<Backup> = {}): Backup {
  return {
    name: "readarr_backup_v1.0.0.0_2026.01.01_00.00.00.zip",
    type: BackupType.Manual,
    size: 1024,
    time: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeDeps(overrides: Partial<BackupControllerDeps> = {}): BackupControllerDeps {
  const backupService: IBackupService = {
    backup: vi.fn(),
    getBackups: vi.fn(() => []),
    restore: vi.fn(),
    getBackupFolder: vi.fn((type?: BackupType) => `/backups/${type ?? ""}`),
  };

  const files = new Map<string, Buffer>();

  // Defaults to "exists" (true) unless a test overrides it or an upload
  // route writes+then-deletes a file this same fake tracks -- the DELETE
  // route's own "does the file still exist on disk" check is exercised by
  // the dedicated 404 test below, which overrides this mock explicitly.
  const diskProvider = {
    fileExists: vi.fn(() => true),
    deleteFile: vi.fn((path: string) => files.delete(path)),
    writeFile: vi.fn((path: string, data: Buffer) => files.set(path, data)),
  };

  const appFolderInfo = { tempFolder: "/tmp" };

  return { backupService, diskProvider, appFolderInfo, ...overrides };
}

function makeApp(deps: BackupControllerDeps) {
  const app = express();
  app.use(express.json());
  app.use("/api/v1/system/backup", backupController(deps));
  app.use(readarrErrorPipeline());
  return app;
}

describe("backupController", () => {
  it("GET / returns backups sorted descending by time, with derived ids and paths", async () => {
    const older = makeBackup({ name: "old.zip", time: "2025-01-01T00:00:00.000Z" });
    const newer = makeBackup({ name: "new.zip", time: "2026-01-01T00:00:00.000Z" });
    const deps = makeDeps();
    (deps.backupService.getBackups as ReturnType<typeof vi.fn>).mockReturnValue([older, newer]);
    const app = makeApp(deps);

    const res = await request(app).get("/api/v1/system/backup");

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].name).toBe("new.zip");
    expect(res.body[1].name).toBe("old.zip");
    expect(res.body[0].path).toBe("/backup/manual/new.zip");
    expect(typeof res.body[0].id).toBe("number");
  });

  it("DELETE /:id 404s when no backup matches the derived id", async () => {
    const deps = makeDeps();
    const app = makeApp(deps);

    const res = await request(app).delete("/api/v1/system/backup/12345");

    expect(res.status).toBe(404);
  });

  it("DELETE /:id deletes the matching backup file", async () => {
    const backup = makeBackup({ name: "to-delete.zip" });
    const deps = makeDeps();
    (deps.backupService.getBackups as ReturnType<typeof vi.fn>).mockReturnValue([backup]);
    const app = makeApp(deps);

    // GET to discover the derived id.
    const listRes = await request(app).get("/api/v1/system/backup");
    const id: number = listRes.body[0].id;

    const res = await request(app).delete(`/api/v1/system/backup/${id}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({});
    expect(deps.diskProvider.deleteFile).toHaveBeenCalledOnce();
  });

  it("DELETE /:id 404s when the file no longer exists on disk", async () => {
    const backup = makeBackup({ name: "missing-on-disk.zip" });
    const deps = makeDeps();
    (deps.backupService.getBackups as ReturnType<typeof vi.fn>).mockReturnValue([backup]);
    (deps.diskProvider.fileExists as ReturnType<typeof vi.fn>).mockReturnValue(false);
    const app = makeApp(deps);

    const listRes = await request(app).get("/api/v1/system/backup");
    const id: number = listRes.body[0].id;

    const res = await request(app).delete(`/api/v1/system/backup/${id}`);

    expect(res.status).toBe(404);
  });

  it("POST /restore/:id 404s when no backup matches", async () => {
    const deps = makeDeps();
    const app = makeApp(deps);

    const res = await request(app).post("/api/v1/system/backup/restore/999");

    expect(res.status).toBe(404);
  });

  it("POST /restore/:id restores and returns restartRequired:true", async () => {
    const backup = makeBackup({ name: "to-restore.zip" });
    const deps = makeDeps();
    (deps.backupService.getBackups as ReturnType<typeof vi.fn>).mockReturnValue([backup]);
    const app = makeApp(deps);

    const listRes = await request(app).get("/api/v1/system/backup");
    const id: number = listRes.body[0].id;

    const res = await request(app).post(`/api/v1/system/backup/restore/${id}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ restartRequired: true });
    expect(deps.backupService.restore).toHaveBeenCalledOnce();
  });

  it("POST /restore/upload rejects an empty body", async () => {
    const deps = makeDeps();
    const app = makeApp(deps);

    const res = await request(app)
      .post("/api/v1/system/backup/restore/upload")
      .set("Content-Type", "multipart/form-data; boundary=----x");

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("file must be provided");
  });

  it("POST /restore/upload rejects an invalid file extension", async () => {
    const deps = makeDeps();
    const app = makeApp(deps);

    const boundary = "----boundary123";
    const body = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="file"; filename="backup.txt"',
      "Content-Type: text/plain",
      "",
      "not a valid backup",
      `--${boundary}--`,
      "",
    ].join("\r\n");

    const res = await request(app)
      .post("/api/v1/system/backup/restore/upload")
      .set("Content-Type", `multipart/form-data; boundary=${boundary}`)
      .send(Buffer.from(body, "utf8"));

    expect(res.status).toBe(415);
    expect(res.body.message).toContain("Invalid extension");
  });

  it("POST /restore/upload accepts a .zip file, restores, and cleans up the temp file", async () => {
    const deps = makeDeps();
    const app = makeApp(deps);

    const boundary = "----boundary456";
    const fileContent = "PK\x03\x04 fake zip bytes";
    const body = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="file"; filename="upload.zip"',
      "Content-Type: application/zip",
      "",
      fileContent,
      `--${boundary}--`,
      "",
    ].join("\r\n");

    const res = await request(app)
      .post("/api/v1/system/backup/restore/upload")
      .set("Content-Type", `multipart/form-data; boundary=${boundary}`)
      .send(Buffer.from(body, "utf8"));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ restartRequired: true });
    expect(deps.backupService.restore).toHaveBeenCalledOnce();
    expect(deps.diskProvider.writeFile).toHaveBeenCalledOnce();
    // Ported: "Cleanup restored file" -- deleteFile called after restore.
    expect(deps.diskProvider.deleteFile).toHaveBeenCalledOnce();

    const writtenPath = (deps.diskProvider.writeFile as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(writtenPath).toContain("readarr_backup_restore.zip");
  });
});

import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BackupArchiveService } from "../backupArchiveService.js";

describe("BackupArchiveService", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "pagarr-archive-test-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("createZip() then extract() round-trips file contents", () => {
    const sourceDir = join(tmpDir, "source");
    mkdirSync(sourceDir);
    const fileA = join(sourceDir, "a.txt");
    const fileB = join(sourceDir, "b.txt");
    writeFileSync(fileA, "content-a");
    writeFileSync(fileB, "content-b");

    const zipPath = join(tmpDir, "backup.zip");
    const service = new BackupArchiveService();
    service.createZip(zipPath, [fileA, fileB]);

    expect(existsSync(zipPath)).toBe(true);

    const extractDir = join(tmpDir, "extracted");
    service.extract(zipPath, extractDir);

    expect(readFileSync(join(extractDir, "a.txt"), "utf8")).toBe("content-a");
    expect(readFileSync(join(extractDir, "b.txt"), "utf8")).toBe("content-b");
  });
});

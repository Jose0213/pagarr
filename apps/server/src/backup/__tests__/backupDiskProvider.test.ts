import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BackupDiskProvider } from "../backupDiskProvider.js";

describe("BackupDiskProvider", () => {
  let tmpDir: string;
  let provider: BackupDiskProvider;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "pagarr-backup-disk-test-"));
    provider = new BackupDiskProvider();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("ensureFolder() creates nested directories", () => {
    const nested = join(tmpDir, "a", "b", "c");
    provider.ensureFolder(nested);
    expect(provider.folderExists(nested)).toBe(true);
  });

  it("folderWritable() reflects real write access", () => {
    expect(provider.folderWritable(tmpDir)).toBe(true);
    expect(provider.folderWritable(join(tmpDir, "does-not-exist"))).toBe(false);
  });

  it("emptyFolder() removes files and subfolders but not the folder itself", () => {
    writeFileSync(join(tmpDir, "file.txt"), "x");
    provider.ensureFolder(join(tmpDir, "sub"));

    provider.emptyFolder(tmpDir);

    expect(provider.folderExists(tmpDir)).toBe(true);
    expect(provider.getFiles(tmpDir, true)).toEqual([]);
  });

  it("getFiles() lists files, recursively when requested", () => {
    writeFileSync(join(tmpDir, "top.txt"), "x");
    provider.ensureFolder(join(tmpDir, "sub"));
    writeFileSync(join(tmpDir, "sub", "nested.txt"), "x");

    expect(provider.getFiles(tmpDir, false)).toEqual([join(tmpDir, "top.txt")]);
    expect(provider.getFiles(tmpDir, true).sort()).toEqual(
      [join(tmpDir, "top.txt"), join(tmpDir, "sub", "nested.txt")].sort()
    );
  });

  it("getFileSize() and fileGetLastWrite() reflect real stat info; missing file defaults gracefully", () => {
    const filePath = join(tmpDir, "sized.txt");
    writeFileSync(filePath, "12345");

    expect(provider.getFileSize(filePath)).toBe(5);
    expect(provider.fileGetLastWrite(filePath)).toBeInstanceOf(Date);

    expect(provider.getFileSize(join(tmpDir, "missing.txt"))).toBe(0);
    expect(provider.fileGetLastWrite(join(tmpDir, "missing.txt"))).toEqual(new Date(0));
  });

  it("deleteFile() is idempotent for a missing file", () => {
    expect(() => provider.deleteFile(join(tmpDir, "missing.txt"))).not.toThrow();
  });

  it("moveFile() relocates a file, optionally overwriting", () => {
    const source = join(tmpDir, "source.txt");
    const target = join(tmpDir, "target.txt");
    writeFileSync(source, "moved");

    provider.moveFile(source, target);

    expect(existsSync(source)).toBe(false);
    expect(readFileSync(target, "utf8")).toBe("moved");
  });

  it("copyFile() duplicates a file without removing the source", () => {
    const source = join(tmpDir, "source2.txt");
    const target = join(tmpDir, "target2.txt");
    writeFileSync(source, "copied");

    provider.copyFile(source, target);

    expect(existsSync(source)).toBe(true);
    expect(readFileSync(target, "utf8")).toBe("copied");
  });

  it("writeAllText() writes UTF-8 file contents", () => {
    const target = join(tmpDir, "written.txt");
    provider.writeAllText(target, "hello world");

    expect(readFileSync(target, "utf8")).toBe("hello world");
  });
});

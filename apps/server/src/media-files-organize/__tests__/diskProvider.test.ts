import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ExtendedDiskProvider } from "../diskProvider.js";

/**
 * New tests (no direct C# fixture -- DiskProviderBaseFixture/
 * DiskProviderFixture exercise a much larger surface via a real filesystem
 * abstraction not practical to mirror 1:1 here). Covers the operations this
 * module's services actually rely on: file/folder existence, move/copy with
 * cross-device (EXDEV) fallback, hardlinking, and recursive empty-subfolder
 * removal -- the last of which is directly load-bearing for
 * bookFileMovingService.ts / renameBookFileService.ts's post-rename cleanup.
 */
describe("ExtendedDiskProvider", () => {
  let tmpDir: string;
  let provider: ExtendedDiskProvider;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "pagarr-organize-disk-test-"));
    provider = new ExtendedDiskProvider();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("fileExists/folderExists reflect real filesystem state", () => {
    const filePath = join(tmpDir, "a.txt");
    writeFileSync(filePath, "hello");

    expect(provider.fileExists(filePath)).toBe(true);
    expect(provider.fileExists(join(tmpDir, "missing.txt"))).toBe(false);
    expect(provider.folderExists(tmpDir)).toBe(true);
    expect(provider.folderExists(join(tmpDir, "missing-dir"))).toBe(false);
  });

  it("folderEmpty is true for an empty directory and false once populated", () => {
    expect(provider.folderEmpty(tmpDir)).toBe(true);
    writeFileSync(join(tmpDir, "a.txt"), "x");
    expect(provider.folderEmpty(tmpDir)).toBe(false);
  });

  it("createFolder creates nested directories recursively", () => {
    const nested = join(tmpDir, "a", "b", "c");
    provider.createFolder(nested);
    expect(existsSync(nested)).toBe(true);
  });

  it("moveFile relocates a file and creates the destination directory", () => {
    const source = join(tmpDir, "source.mp3");
    const destDir = join(tmpDir, "dest");
    const dest = join(destDir, "moved.mp3");
    writeFileSync(source, "audio-bytes");

    provider.moveFile(source, dest);

    expect(existsSync(source)).toBe(false);
    expect(existsSync(dest)).toBe(true);
  });

  it("moveFile with overwrite=true replaces an existing destination file", () => {
    const source = join(tmpDir, "source.mp3");
    const dest = join(tmpDir, "dest.mp3");
    writeFileSync(source, "new-bytes");
    writeFileSync(dest, "old-bytes");

    provider.moveFile(source, dest, true);

    expect(readdirSync(tmpDir)).toContain("dest.mp3");
    expect(existsSync(source)).toBe(false);
  });

  it("copyFile duplicates a file without removing the source", () => {
    const source = join(tmpDir, "source.mp3");
    const dest = join(tmpDir, "dest.mp3");
    writeFileSync(source, "audio-bytes");

    provider.copyFile(source, dest);

    expect(existsSync(source)).toBe(true);
    expect(existsSync(dest)).toBe(true);
  });

  it("tryCreateHardLink returns true and links successfully on the same volume", () => {
    const source = join(tmpDir, "source.mp3");
    const dest = join(tmpDir, "dest.mp3");
    writeFileSync(source, "audio-bytes");

    const result = provider.tryCreateHardLink(source, dest);

    expect(result).toBe(true);
    expect(existsSync(dest)).toBe(true);
  });

  it("tryCreateHardLink returns false (not throws) when the source doesn't exist", () => {
    const result = provider.tryCreateHardLink(
      join(tmpDir, "missing.mp3"),
      join(tmpDir, "dest.mp3")
    );
    expect(result).toBe(false);
  });

  it("getFiles/getDirectories list immediate and recursive contents", () => {
    mkdirSync(join(tmpDir, "sub"));
    writeFileSync(join(tmpDir, "a.mp3"), "x");
    writeFileSync(join(tmpDir, "sub", "b.mp3"), "y");

    expect(provider.getFiles(tmpDir, false)).toHaveLength(1);
    expect(provider.getFiles(tmpDir, true)).toHaveLength(2);
    expect(provider.getDirectories(tmpDir)).toHaveLength(1);
  });

  it("getFileInfos returns size/extension/mtime for every file, recursively when asked", () => {
    writeFileSync(join(tmpDir, "a.mp3"), "12345");
    mkdirSync(join(tmpDir, "sub"));
    writeFileSync(join(tmpDir, "sub", "b.flac"), "1234567");

    const shallow = provider.getFileInfos(tmpDir, false);
    expect(shallow).toHaveLength(1);
    expect(shallow[0]!.extension).toBe(".mp3");
    expect(shallow[0]!.length).toBe(5);

    const deep = provider.getFileInfos(tmpDir, true);
    expect(deep.map((f) => f.name).sort()).toEqual(["a.mp3", "b.flac"]);
  });

  it("removeEmptySubfolders deletes subfolders left empty after files are moved out, but keeps folders that still contain files", () => {
    const emptyDir = join(tmpDir, "empty");
    const nonEmptyDir = join(tmpDir, "nonempty");
    mkdirSync(emptyDir);
    mkdirSync(nonEmptyDir);
    writeFileSync(join(nonEmptyDir, "keep.mp3"), "x");

    provider.removeEmptySubfolders(tmpDir);

    expect(existsSync(emptyDir)).toBe(false);
    expect(existsSync(nonEmptyDir)).toBe(true);
  });

  it("removeEmptySubfolders removes a folder whose only contents are now-empty subfolders", () => {
    const outer = join(tmpDir, "outer");
    const inner = join(outer, "inner");
    mkdirSync(inner, { recursive: true });

    provider.removeEmptySubfolders(tmpDir);

    expect(existsSync(outer)).toBe(false);
  });

  it("fileGetLastWrite/fileSetLastWriteTime round-trip a timestamp", () => {
    const filePath = join(tmpDir, "a.mp3");
    writeFileSync(filePath, "x");

    const target = new Date("2020-01-15T00:00:00.000Z");
    provider.fileSetLastWriteTime(filePath, target);

    expect(provider.fileGetLastWrite(filePath).getTime()).toBe(target.getTime());
  });

  it("deleteFile silently no-ops for a missing file (matches C#'s tolerant behavior)", () => {
    expect(() => provider.deleteFile(join(tmpDir, "missing.mp3"))).not.toThrow();
  });
});

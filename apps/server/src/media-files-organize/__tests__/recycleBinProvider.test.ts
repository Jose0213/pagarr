import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ExtendedDiskProvider } from "../diskProvider.js";
import { RecycleBinProvider } from "../recycleBinProvider.js";
import type { IConfigService } from "../../config/configService.js";

/**
 * New tests covering NzbDrone.Core.Test/MediaFiles's RecycleBinProviderFixture
 * intent: permanent-delete-when-unconfigured, move-to-bin-when-configured,
 * and the collision-avoidance rename-with-suffix behavior -- directly
 * relevant to known-issue #5 (filesystem permission friction), since this
 * is the exact path a real deployment hits when the recycle bin folder
 * isn't writable.
 */
function makeConfigService(recycleBin: string, cleanupDays = 7): IConfigService {
  return {
    recycleBin,
    recycleBinCleanupDays: cleanupDays,
  } as IConfigService;
}

describe("RecycleBinProvider", () => {
  let tmpDir: string;
  let libraryDir: string;
  let binDir: string;
  let provider: ExtendedDiskProvider;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "pagarr-recyclebin-test-"));
    libraryDir = join(tmpDir, "library");
    binDir = join(tmpDir, "bin");
    provider = new ExtendedDiskProvider();
    provider.createFolder(libraryDir);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("deleteFile permanently deletes when no recycle bin is configured", () => {
    const filePath = join(libraryDir, "book.epub");
    writeFileSync(filePath, "x");

    const recycleBinProvider = new RecycleBinProvider(provider, makeConfigService(""));
    recycleBinProvider.deleteFile(filePath);

    expect(existsSync(filePath)).toBe(false);
    expect(existsSync(binDir)).toBe(false);
  });

  it("deleteFile moves the file into the configured recycle bin", () => {
    const filePath = join(libraryDir, "book.epub");
    writeFileSync(filePath, "contents");

    const recycleBinProvider = new RecycleBinProvider(provider, makeConfigService(binDir));
    recycleBinProvider.deleteFile(filePath);

    expect(existsSync(filePath)).toBe(false);
    expect(existsSync(join(binDir, "book.epub"))).toBe(true);
  });

  it("deleteFile avoids collisions by appending an incrementing suffix", () => {
    const first = join(libraryDir, "book.epub");
    writeFileSync(first, "first");
    const recycleBinProvider = new RecycleBinProvider(provider, makeConfigService(binDir));
    recycleBinProvider.deleteFile(first);

    const second = join(libraryDir, "book.epub");
    writeFileSync(second, "second");
    recycleBinProvider.deleteFile(second);

    expect(existsSync(join(binDir, "book.epub"))).toBe(true);
    expect(existsSync(join(binDir, "book_2.epub"))).toBe(true);
  });

  it("deleteFile respects a subfolder argument", () => {
    const filePath = join(libraryDir, "book.epub");
    writeFileSync(filePath, "x");

    const recycleBinProvider = new RecycleBinProvider(provider, makeConfigService(binDir));
    recycleBinProvider.deleteFile(filePath, "Some Author");

    expect(existsSync(join(binDir, "Some Author", "book.epub"))).toBe(true);
  });

  it("deleteFolder permanently deletes when no recycle bin is configured", () => {
    const folderPath = join(libraryDir, "Some Author");
    provider.createFolder(folderPath);
    writeFileSync(join(folderPath, "book.epub"), "x");

    const recycleBinProvider = new RecycleBinProvider(provider, makeConfigService(""));
    recycleBinProvider.deleteFolder(folderPath);

    expect(existsSync(folderPath)).toBe(false);
  });

  it("deleteFolder moves the folder into the configured recycle bin", () => {
    const folderPath = join(libraryDir, "Some Author");
    provider.createFolder(folderPath);
    writeFileSync(join(folderPath, "book.epub"), "x");

    const recycleBinProvider = new RecycleBinProvider(provider, makeConfigService(binDir));
    recycleBinProvider.deleteFolder(folderPath);

    expect(existsSync(folderPath)).toBe(false);
    expect(existsSync(join(binDir, "Some Author", "book.epub"))).toBe(true);
  });

  it("empty() is a no-op when no recycle bin is configured", () => {
    const recycleBinProvider = new RecycleBinProvider(provider, makeConfigService(""));
    expect(() => recycleBinProvider.empty()).not.toThrow();
  });

  it("empty() removes every file and folder from the recycle bin", () => {
    provider.createFolder(binDir);
    writeFileSync(join(binDir, "a.epub"), "x");
    provider.createFolder(join(binDir, "sub"));
    writeFileSync(join(binDir, "sub", "b.epub"), "y");

    const recycleBinProvider = new RecycleBinProvider(provider, makeConfigService(binDir));
    recycleBinProvider.empty();

    expect(existsSync(join(binDir, "a.epub"))).toBe(false);
    expect(existsSync(join(binDir, "sub"))).toBe(false);
  });

  it("cleanup() is a no-op when cleanupDays is 0", () => {
    provider.createFolder(binDir);
    const oldFile = join(binDir, "old.epub");
    writeFileSync(oldFile, "x");
    provider.fileSetLastWriteTime(oldFile, new Date(0));

    const recycleBinProvider = new RecycleBinProvider(provider, makeConfigService(binDir, 0));
    recycleBinProvider.cleanup();

    expect(existsSync(oldFile)).toBe(true);
  });

  it("cleanup() deletes files older than the configured retention", () => {
    provider.createFolder(binDir);
    const oldFile = join(binDir, "old.epub");
    const newFile = join(binDir, "new.epub");
    writeFileSync(oldFile, "x");
    writeFileSync(newFile, "y");
    provider.fileSetLastWriteTime(oldFile, new Date(0));

    const recycleBinProvider = new RecycleBinProvider(provider, makeConfigService(binDir, 7));
    recycleBinProvider.cleanup();

    expect(existsSync(oldFile)).toBe(false);
    expect(existsSync(newFile)).toBe(true);
  });
});

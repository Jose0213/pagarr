import { describe, expect, it, vi } from "vitest";
import { DownloadItemStatus } from "../../DownloadItemStatus.js";
import { fakeDiskProvider } from "../testFixtures.js";
import { ScanWatchFolder } from "../../blackhole/ScanWatchFolder.js";
import type { IDiskScanServiceLike } from "../../blackhole/IDiskScanServiceLike.js";

function fakeDiskScanService(overrides: Partial<IDiskScanServiceLike> = {}): IDiskScanServiceLike {
  return {
    getBookFiles: vi.fn(() => []),
    filterFiles: vi.fn((_base, files) => files),
    filterPaths: vi.fn((_base, paths) => paths),
    ...overrides,
  };
}

describe("ScanWatchFolder", () => {
  it("returns a completed item for a fully-written folder once the wait period has elapsed", async () => {
    let nowMs = 1_000_000;
    const diskProvider = fakeDiskProvider({
      getDirectories: vi.fn(() => ["C:\\Watch\\MyBook"]),
      getFiles: vi.fn(() => ["C:\\Watch\\MyBook\\book.mp3"]),
      getFileSize: vi.fn(() => 1000),
      isFileLocked: vi.fn(() => false),
      folderGetCreationTime: vi.fn(() => 1000),
      folderGetLastWrite: vi.fn(() => 1000),
      fileGetLastWrite: vi.fn(() => 1000),
    });
    const scanner = new ScanWatchFolder(
      fakeDiskScanService(),
      diskProvider,
      undefined,
      () => nowMs
    );

    // First scan: brand new item, still within the wait-period grace window.
    await scanner.getItems("C:\\Watch", 30000);

    // Second scan, unchanged hash, past the wait period.
    nowMs += 31000;
    const items = await scanner.getItems("C:\\Watch", 30000);

    expect(items).toHaveLength(1);
    expect(items[0]!.status).toBe(DownloadItemStatus.Completed);
    expect(items[0]!.totalSize).toBe(1000);
  });

  it("marks an item as Downloading (with no remainingTime) when one of its files is locked, even past the wait period", async () => {
    let nowMs = 1_000_000;
    const diskProvider = fakeDiskProvider({
      getDirectories: vi.fn(() => ["C:\\Watch\\MyBook"]),
      getFiles: vi.fn(() => ["C:\\Watch\\MyBook\\book.mp3"]),
      getFileSize: vi.fn(() => 1000),
      isFileLocked: vi.fn(() => true),
      folderGetCreationTime: vi.fn(() => 1000),
      folderGetLastWrite: vi.fn(() => 1000),
      fileGetLastWrite: vi.fn(() => 1000),
    });
    const scanner = new ScanWatchFolder(
      fakeDiskScanService(),
      diskProvider,
      undefined,
      () => nowMs
    );

    await scanner.getItems("C:\\Watch", 30000);
    nowMs += 31000;
    const [item] = await scanner.getItems("C:\\Watch", 30000);

    expect(item!.status).toBe(DownloadItemStatus.Downloading);
    expect(item!.remainingTime).toBeNull();
  });

  it("stays Downloading with a remainingTime until the wait period has elapsed for a newly-seen item", async () => {
    let nowMs = 1_000_000;
    // Folder/file mtimes stay fixed across scans (nothing on disk actually
    // changes) -- only the "now" clock advances, so the computed content
    // hash is identical between scans and the cache-hit "unchanged" path is
    // actually exercised.
    const diskProvider = fakeDiskProvider({
      getDirectories: vi.fn(() => ["C:\\Watch\\MyBook"]),
      getFiles: vi.fn(() => ["C:\\Watch\\MyBook\\book.mp3"]),
      getFileSize: vi.fn(() => 1000),
      isFileLocked: vi.fn(() => false),
      folderGetCreationTime: vi.fn(() => 1000),
      folderGetLastWrite: vi.fn(() => 1000),
      fileGetLastWrite: vi.fn(() => 1000),
    });
    const scanner = new ScanWatchFolder(
      fakeDiskScanService(),
      diskProvider,
      undefined,
      () => nowMs
    );

    // First scan: item is brand new (no previous cache entry), so
    // LastChanged = now and the 30s wait period hasn't elapsed yet.
    const [firstItem] = await scanner.getItems("C:\\Watch", 30000);
    expect(firstItem!.status).toBe(DownloadItemStatus.Downloading);
    expect(firstItem!.remainingTime).not.toBeNull();

    // Second scan, same hash, wait period elapsed: now Completed.
    nowMs += 31000;
    const [secondItem] = await scanner.getItems("C:\\Watch", 30000);
    expect(secondItem!.status).toBe(DownloadItemStatus.Completed);
  });

  it("includes non-book/audio files discovered via getBookFiles", async () => {
    const diskProvider = fakeDiskProvider({
      getDirectories: vi.fn(() => []),
      isFileLocked: vi.fn(() => false),
    });
    const diskScanService = fakeDiskScanService({
      getBookFiles: vi.fn(() => [
        { name: "book.mp3", fullName: "C:\\Watch\\book.mp3", length: 500, lastWriteTimeMs: 1000 },
      ]),
    });
    const scanner = new ScanWatchFolder(diskScanService, diskProvider);

    const items = await scanner.getItems("C:\\Watch", 30000);
    expect(items).toHaveLength(1);
    expect(items[0]!.title).toBe("book.mp3");
    expect(items[0]!.totalSize).toBe(500);
  });

  it("filters out excluded paths/files via the injected disk scan service", async () => {
    const diskProvider = fakeDiskProvider({
      getDirectories: vi.fn(() => ["C:\\Watch\\@eaDir", "C:\\Watch\\RealFolder"]),
      getFiles: vi.fn(() => []),
      isFileLocked: vi.fn(() => false),
    });
    const diskScanService = fakeDiskScanService({
      filterPaths: vi.fn((_base, paths: string[]) => paths.filter((p) => !p.includes("@eaDir"))),
    });
    const scanner = new ScanWatchFolder(diskScanService, diskProvider);

    const items = await scanner.getItems("C:\\Watch", 30000);
    expect(items).toHaveLength(1);
    expect(items[0]!.outputPath.fullPath).toBe("C:\\Watch\\RealFolder");
  });
});

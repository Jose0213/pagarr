import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, readdirSync, rmSync, statfsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DiskProvider } from "./disk-provider.js";

/**
 * Ported test cases from DiskProviderBaseFixture/DiskProviderFixture's
 * FolderExists/FolderWritable/GetAvailableSpace/GetTotalSize coverage.
 *
 * Per the task brief, free-space/filesystem-dependent logic here is tested
 * with the real fs call mocked -- `statfsSync` is stubbed so assertions
 * don't depend on the actual disk state of whatever machine/CI runner this
 * runs on. `folderExists`/`folderWritable` are exercised against a real
 * temp directory instead (cheap, deterministic, no mocking needed for
 * plain existence/write checks).
 */

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return { ...actual, statfsSync: vi.fn(actual.statfsSync) };
});

describe("DiskProvider", () => {
  let tmpDir: string;
  let provider: DiskProvider;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "pagarr-root-folder-test-"));
    provider = new DiskProvider();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    vi.resetAllMocks();
  });

  describe("folderExists", () => {
    it("returns true for an existing directory", () => {
      expect(provider.folderExists(tmpDir)).toBe(true);
    });

    it("returns false for a directory that doesn't exist", () => {
      expect(provider.folderExists(join(tmpDir, "does-not-exist"))).toBe(false);
    });
  });

  describe("folderWritable", () => {
    it("returns true for a writable directory (writes and cleans up a probe file)", async () => {
      await expect(provider.folderWritable(tmpDir)).resolves.toBe(true);

      // Ported behavior: DiskProviderBase.FolderWritable deletes its probe
      // file after writing it -- confirm no stray file is left behind.
      expect(readdirSync(tmpDir)).toHaveLength(0);
    });

    it("returns false when the directory doesn't exist (write fails)", async () => {
      await expect(provider.folderWritable(join(tmpDir, "missing"))).resolves.toBe(false);
    });
  });

  describe("getAvailableSpace", () => {
    it("returns bavail * bsize from the mocked statfs result", () => {
      vi.mocked(statfsSync).mockReturnValue({
        bavail: 1000,
        bsize: 4096,
        blocks: 5000,
      } as unknown as ReturnType<typeof statfsSync>);

      expect(provider.getAvailableSpace(tmpDir)).toBe(1000 * 4096);
    });

    it("returns null if the underlying statfs call throws (e.g. unmounted/inaccessible path)", () => {
      vi.mocked(statfsSync).mockImplementation(() => {
        throw new Error("ENOENT");
      });

      expect(provider.getAvailableSpace("/nonexistent")).toBeNull();
    });
  });

  describe("getTotalSize", () => {
    it("returns blocks * bsize from the mocked statfs result", () => {
      vi.mocked(statfsSync).mockReturnValue({
        bavail: 1000,
        bsize: 4096,
        blocks: 5000,
      } as unknown as ReturnType<typeof statfsSync>);

      expect(provider.getTotalSize(tmpDir)).toBe(5000 * 4096);
    });

    it("returns null if the underlying statfs call throws", () => {
      vi.mocked(statfsSync).mockImplementation(() => {
        throw new Error("ENOENT");
      });

      expect(provider.getTotalSize("/nonexistent")).toBeNull();
    });
  });
});

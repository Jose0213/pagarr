import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FileSystemEntityType, FileSystemLookupService } from "../FileSystemLookupService.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function makeTempTree(): string {
  const root = mkdtempSync(join(tmpdir(), "pagarr-fs-"));
  tempDirs.push(root);
  mkdirSync(join(root, "Zebra"));
  mkdirSync(join(root, "Apple"));
  mkdirSync(join(root, "$Recycle.Bin"));
  writeFileSync(join(root, "book.epub"), "epub-contents");
  writeFileSync(join(root, "notes.txt"), "notes");
  return root;
}

describe("FileSystemLookupService", () => {
  describe("lookupContents", () => {
    it("lists directories (sorted, junk folders removed) for a real folder, trailing-slash allowed", () => {
      const root = makeTempTree();
      const service = new FileSystemLookupService({ folderExists: (p) => p === root });

      const result = service.lookupContents(root, false, true);

      expect(result.directories?.map((d) => d.name)).toEqual(["Apple", "Zebra"]);
      expect(result.directories?.every((d) => d.type === FileSystemEntityType.Folder)).toBe(true);
    });

    it("does not include files unless includeFiles is true", () => {
      const root = makeTempTree();
      const service = new FileSystemLookupService({ folderExists: (p) => p === root });

      const withoutFiles = service.lookupContents(root, false, true);
      expect(withoutFiles.files).toBeUndefined();

      const withFiles = service.lookupContents(root, true, true);
      expect(withFiles.files?.map((f) => f.name).sort()).toEqual(["book.epub", "notes.txt"]);
      expect(withFiles.files?.find((f) => f.name === "book.epub")?.extension).toBe(".epub");
    });

    it("falls back to the parent-of-query-string parse when allowFoldersWithoutTrailingSlashes is false", () => {
      const root = makeTempTree();
      const service = new FileSystemLookupService({ folderExists: () => true });

      // Query has no trailing separator -- LookupContents should treat
      // everything after the last separator as a partial name and list the
      // parent directory instead (same behavior for both true/false here
      // since the real folder exists either way; this exercises the
      // "doesn't end in a separator" branch of the real C# method).
      const childPath = join(root, "Apple");
      const result = service.lookupContents(childPath, false, false);

      expect(result.directories).toBeDefined();
    });

    it("returns an empty result when query has no separator and doesn't resolve as a folder", () => {
      const service = new FileSystemLookupService({ folderExists: () => false });

      const result = service.lookupContents("nofolder", false, false);

      expect(result).toEqual({});
    });

    it("returns Windows drives when query is empty and running as Windows", () => {
      vi.stubGlobal("process", { ...process, platform: "win32" });
      try {
        const service = new FileSystemLookupService({
          folderExists: () => false,
          getMounts: () => [
            { name: "C:", volumeLabel: "Local Disk", rootDirectory: "C:\\", driveType: "fixed" },
            { name: "Z:", volumeLabel: null, rootDirectory: "Z:\\", driveType: "network" },
          ],
        });

        const result = service.lookupContents("", false, false);

        expect(result.directories).toEqual([
          {
            type: FileSystemEntityType.Drive,
            name: "C: (Local Disk)",
            path: "C:\\",
            lastModified: null,
          },
          { type: FileSystemEntityType.Drive, name: "Z:", path: "Z:\\", lastModified: null },
        ]);
      } finally {
        vi.unstubAllGlobals();
      }
    });

    it("excludes network drives when isWindowsService is true", () => {
      vi.stubGlobal("process", { ...process, platform: "win32" });
      try {
        const service = new FileSystemLookupService({
          folderExists: () => false,
          isWindowsService: true,
          getMounts: () => [
            { name: "C:", volumeLabel: null, rootDirectory: "C:\\", driveType: "fixed" },
            { name: "Z:", volumeLabel: null, rootDirectory: "Z:\\", driveType: "network" },
          ],
        });

        const result = service.lookupContents(undefined, false, false);

        expect(result.directories?.map((d) => d.path)).toEqual(["C:\\"]);
      } finally {
        vi.unstubAllGlobals();
      }
    });

    it("returns a parent-only result for a folder that doesn't exist", () => {
      const root = makeTempTree();
      const missingChild = join(root, "does-not-exist") + sep;
      const service = new FileSystemLookupService({ folderExists: () => false });

      const result = service.lookupContents(missingChild, false, false);

      expect(result.directories).toBeUndefined();
      expect(result.parent).toBeDefined();
    });
  });
});

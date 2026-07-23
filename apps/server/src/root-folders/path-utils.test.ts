import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getCleanPath, isParentPath, isPathRooted, pathEquals } from "./path-utils.js";

/**
 * Ported test cases from Readarr's actual PathExtensionsFixture (NUnit),
 * translated to vitest, covering PathEquals/IsParentPath/GetCleanPath/the
 * Path.IsPathRooted check RootFolderService.VerifyRootFolder performs --
 * plus new cases exercising the Windows/non-Windows case-sensitivity branch
 * this module's path-utils.ts ports from DiskProviderBase.PathStringComparison.
 */

describe("isPathRooted", () => {
  it("accepts unix-rooted paths", () => {
    expect(isPathRooted("/books")).toBe(true);
    expect(isPathRooted("/mnt/media/books")).toBe(true);
  });

  it("accepts windows-rooted paths regardless of host OS (matches .NET's OS-agnostic Path.IsPathRooted)", () => {
    expect(isPathRooted("C:\\Books")).toBe(true);
    expect(isPathRooted("D:\\Media\\Books")).toBe(true);
  });

  it("accepts UNC paths", () => {
    expect(isPathRooted("\\\\server\\share\\books")).toBe(true);
  });

  it("rejects relative paths", () => {
    expect(isPathRooted("books")).toBe(false);
    expect(isPathRooted("./books")).toBe(false);
    expect(isPathRooted("../books")).toBe(false);
    expect(isPathRooted("")).toBe(false);
  });
});

describe("getCleanPath", () => {
  const originalPlatform = process.platform;

  afterEach(() => {
    Object.defineProperty(process, "platform", { value: originalPlatform });
  });

  it("trims a single trailing separator (unix)", () => {
    Object.defineProperty(process, "platform", { value: "linux" });
    expect(getCleanPath("/books/")).toBe("/books");
  });

  it("does not trim the drive-root separator (windows, 'C:\\\\')", () => {
    Object.defineProperty(process, "platform", { value: "win32" });
    expect(getCleanPath("C:\\")).toBe("C:\\");
  });

  it("trims a single trailing separator on windows for non-root paths", () => {
    Object.defineProperty(process, "platform", { value: "win32" });
    expect(getCleanPath("C:\\Books\\")).toBe("C:\\Books");
  });
});

describe("pathEquals", () => {
  const realPlatform = process.platform;

  afterEach(() => {
    Object.defineProperty(process, "platform", { value: realPlatform });
  });

  describe("on a case-insensitive OS (Windows)", () => {
    beforeEach(() => {
      Object.defineProperty(process, "platform", { value: "win32" });
    });

    it("treats differently-cased identical paths as equal", () => {
      expect(pathEquals("C:\\Books", "c:\\books")).toBe(true);
    });

    it("treats a path with/without a trailing separator as equal", () => {
      expect(pathEquals("C:\\Books\\", "C:\\Books")).toBe(true);
    });
  });

  describe("on a case-sensitive OS (Linux)", () => {
    beforeEach(() => {
      Object.defineProperty(process, "platform", { value: "linux" });
    });

    it("treats differently-cased paths as NOT equal", () => {
      expect(pathEquals("/Books", "/books")).toBe(false);
    });

    it("treats identical paths as equal", () => {
      expect(pathEquals("/books", "/books")).toBe(true);
    });

    it("treats a path with/without a trailing separator as equal", () => {
      expect(pathEquals("/books/", "/books")).toBe(true);
    });
  });

  it("treats entirely different paths as not equal", () => {
    expect(pathEquals("/books", "/audiobooks")).toBe(false);
  });
});

describe("isParentPath", () => {
  it("returns true when parentPath is a direct parent of childPath", () => {
    expect(isParentPath("/books", "/books/author")).toBe(true);
  });

  it("returns true when parentPath is an ancestor at any depth (not just direct parent)", () => {
    expect(isParentPath("/books", "/books/author/book-title")).toBe(true);
  });

  it("returns false when childPath equals parentPath (not its own ancestor)", () => {
    expect(isParentPath("/books", "/books")).toBe(false);
  });

  it("returns false when parentPath is NOT an ancestor of childPath", () => {
    expect(isParentPath("/books", "/audiobooks/author")).toBe(false);
  });

  it("returns false when childPath is shorter than parentPath", () => {
    expect(isParentPath("/books/author", "/books")).toBe(false);
  });

  it("handles trailing separators on either input", () => {
    expect(isParentPath("/books/", "/books/author/")).toBe(true);
  });

  it("respects windows drive-root parentPath ('C:\\\\')", () => {
    expect(isParentPath("C:\\", "C:\\Books")).toBe(true);
  });
});

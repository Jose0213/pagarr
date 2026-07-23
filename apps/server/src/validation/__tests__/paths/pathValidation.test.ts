import { describe, expect, it, afterEach } from "vitest";
import {
  containsInvalidPathChars,
  isPathValid,
  isValidFolderPath,
} from "../../paths/pathValidation.js";

/**
 * Translated behavior tests for FolderValidator/PathValidator and the
 * PathExtensions.IsPathValid(CurrentOs) logic they defer to. No direct C#
 * fixture exists for FolderValidator/PathValidator themselves; PathExtensions'
 * own IsPathValid has real coverage in NzbDrone.Common.Test, exercised here
 * via the OS-branching convention this port already established
 * (root-folders/path-utils.test.ts's platform-stub pattern).
 */

describe("containsInvalidPathChars", () => {
  it("detects the NUL character", () => {
    expect(containsInvalidPathChars("foo\u0000bar")).toBe(true);
  });

  it("detects a C0 control character", () => {
    expect(containsInvalidPathChars("foo\u0007bar")).toBe(true);
    expect(containsInvalidPathChars("foo\u001fbar")).toBe(true);
  });

  it("detects the four extra invalid characters (quote, less-than, greater-than, pipe)", () => {
    expect(containsInvalidPathChars('foo"bar')).toBe(true);
    expect(containsInvalidPathChars("foo<bar")).toBe(true);
    expect(containsInvalidPathChars("foo>bar")).toBe(true);
    expect(containsInvalidPathChars("foo|bar")).toBe(true);
  });

  it("does not flag an ordinary path", () => {
    expect(containsInvalidPathChars("/mnt/media/Books")).toBe(false);
    expect(containsInvalidPathChars("C:\\Books")).toBe(false);
  });
});

describe("isPathValid", () => {
  const originalPlatform = process.platform;

  afterEach(() => {
    Object.defineProperty(process, "platform", { value: originalPlatform });
  });

  it("rejects null/undefined/empty/whitespace-only", () => {
    expect(isPathValid(null)).toBe(false);
    expect(isPathValid(undefined)).toBe(false);
    expect(isPathValid("")).toBe(false);
    expect(isPathValid("   ")).toBe(false);
  });

  it("rejects a path with invalid characters regardless of OS", () => {
    Object.defineProperty(process, "platform", { value: "linux" });
    expect(isPathValid("/books/foo|bar")).toBe(false);
  });

  describe("on Windows", () => {
    it("accepts a drive-letter-rooted path", () => {
      Object.defineProperty(process, "platform", { value: "win32" });
      expect(isPathValid("C:\\Books")).toBe(true);
    });

    it("accepts a UNC path", () => {
      Object.defineProperty(process, "platform", { value: "win32" });
      expect(isPathValid("\\\\server\\share\\books")).toBe(true);
    });

    it("rejects a unix-style rooted path", () => {
      Object.defineProperty(process, "platform", { value: "win32" });
      expect(isPathValid("/books")).toBe(false);
    });

    it("rejects a relative path", () => {
      Object.defineProperty(process, "platform", { value: "win32" });
      expect(isPathValid("Books")).toBe(false);
    });
  });

  describe("on non-Windows", () => {
    it("accepts a unix-rooted path", () => {
      Object.defineProperty(process, "platform", { value: "linux" });
      expect(isPathValid("/mnt/media/Books")).toBe(true);
    });

    it("rejects a drive-letter path", () => {
      Object.defineProperty(process, "platform", { value: "linux" });
      expect(isPathValid("C:\\Books")).toBe(false);
    });

    it("rejects a relative path", () => {
      Object.defineProperty(process, "platform", { value: "linux" });
      expect(isPathValid("Books")).toBe(false);
    });
  });
});

describe("isValidFolderPath", () => {
  it("rejects null/undefined", () => {
    expect(isValidFolderPath(null)).toBe(false);
    expect(isValidFolderPath(undefined)).toBe(false);
  });

  it("defers to isPathValid otherwise", () => {
    expect(isValidFolderPath("")).toBe(false);
  });
});

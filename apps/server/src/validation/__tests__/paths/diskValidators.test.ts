import { describe, expect, it, afterEach } from "vitest";
import {
  pathExists,
  fileExists,
  folderWritable,
  currentUserName,
} from "../../paths/diskValidators.js";

/**
 * Translated behavior tests for PathExistsValidator/FileExistsValidator/
 * FolderWritableValidator. No direct C# fixtures exist for these three
 * (exercised indirectly through disk-provider-backed integration fixtures
 * in the real test suite).
 */

describe("pathExists", () => {
  it("is invalid for null/undefined", () => {
    const diskProvider = { folderExists: () => true };
    expect(pathExists(diskProvider, null)).toBe(false);
    expect(pathExists(diskProvider, undefined)).toBe(false);
  });

  it("defers to diskProvider.folderExists", () => {
    expect(pathExists({ folderExists: () => true }, "/books")).toBe(true);
    expect(pathExists({ folderExists: () => false }, "/books")).toBe(false);
  });
});

describe("fileExists", () => {
  it("is invalid for null/undefined", () => {
    const diskProvider = { fileExists: () => true };
    expect(fileExists(diskProvider, null)).toBe(false);
    expect(fileExists(diskProvider, undefined)).toBe(false);
  });

  it("defers to diskProvider.fileExists", () => {
    expect(fileExists({ fileExists: () => true }, "/books/a.epub")).toBe(true);
    expect(fileExists({ fileExists: () => false }, "/books/a.epub")).toBe(false);
  });
});

describe("folderWritable", () => {
  it("is invalid for null/undefined", async () => {
    const diskProvider = { folderWritable: () => true };
    expect(await folderWritable(diskProvider, null)).toBe(false);
    expect(await folderWritable(diskProvider, undefined)).toBe(false);
  });

  it("defers to a synchronous diskProvider.folderWritable", async () => {
    expect(await folderWritable({ folderWritable: () => true }, "/books")).toBe(true);
    expect(await folderWritable({ folderWritable: () => false }, "/books")).toBe(false);
  });

  it("defers to an asynchronous diskProvider.folderWritable", async () => {
    expect(await folderWritable({ folderWritable: () => Promise.resolve(true) }, "/books")).toBe(
      true
    );
  });
});

describe("currentUserName", () => {
  const originalUsername = process.env["USERNAME"];
  const originalUser = process.env["USER"];

  afterEach(() => {
    if (originalUsername === undefined) {
      delete process.env["USERNAME"];
    } else {
      process.env["USERNAME"] = originalUsername;
    }
    if (originalUser === undefined) {
      delete process.env["USER"];
    } else {
      process.env["USER"] = originalUser;
    }
  });

  it("prefers USERNAME (Windows)", () => {
    process.env["USERNAME"] = "zay";
    process.env["USER"] = "other";
    expect(currentUserName()).toBe("zay");
  });

  it("falls back to USER when USERNAME is unset", () => {
    delete process.env["USERNAME"];
    process.env["USER"] = "zay";
    expect(currentUserName()).toBe("zay");
  });

  it("falls back to empty string when neither is set", () => {
    delete process.env["USERNAME"];
    delete process.env["USER"];
    expect(currentUserName()).toBe("");
  });
});

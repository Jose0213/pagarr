import { describe, expect, it } from "vitest";
import { isValidFolderPermissionMask } from "../folderChmodValidator.js";

/**
 * Translated from NzbDrone.Mono.Test/DiskProviderTests/DiskProviderFixture.cs,
 * IsValidFolderPermissionMask_should_return_correct -- the real fixture
 * covering the logic FolderChmodValidator defers to
 * (IDiskProvider.IsValidFolderPermissionMask).
 */

describe("isValidFolderPermissionMask", () => {
  it("rejects null/undefined", () => {
    expect(isValidFolderPermissionMask(null)).toBe(false);
    expect(isValidFolderPermissionMask(undefined)).toBe(false);
  });

  it("rejects any mask with a special bit set (setuid/setgid/sticky)", () => {
    expect(isValidFolderPermissionMask("1755")).toBe(false);
    expect(isValidFolderPermissionMask("2755")).toBe(false);
    expect(isValidFolderPermissionMask("4755")).toBe(false);
    expect(isValidFolderPermissionMask("7755")).toBe(false);
  });

  it("rejects 3-digit masks missing full owner rwx", () => {
    expect(isValidFolderPermissionMask("000")).toBe(false);
    expect(isValidFolderPermissionMask("100")).toBe(false);
    expect(isValidFolderPermissionMask("200")).toBe(false);
    expect(isValidFolderPermissionMask("300")).toBe(false);
    expect(isValidFolderPermissionMask("400")).toBe(false);
    expect(isValidFolderPermissionMask("500")).toBe(false);
    expect(isValidFolderPermissionMask("600")).toBe(false);
  });

  it("accepts 700 (full owner rwx, 3-digit)", () => {
    expect(isValidFolderPermissionMask("700")).toBe(true);
  });

  it("rejects 4-digit masks (leading 0, no special bits) missing full owner rwx", () => {
    expect(isValidFolderPermissionMask("0000")).toBe(false);
    expect(isValidFolderPermissionMask("0100")).toBe(false);
    expect(isValidFolderPermissionMask("0200")).toBe(false);
    expect(isValidFolderPermissionMask("0300")).toBe(false);
    expect(isValidFolderPermissionMask("0400")).toBe(false);
    expect(isValidFolderPermissionMask("0500")).toBe(false);
    expect(isValidFolderPermissionMask("0600")).toBe(false);
  });

  it("accepts 0700 (full owner rwx, 4-digit with leading 0)", () => {
    expect(isValidFolderPermissionMask("0700")).toBe(true);
  });

  it("accepts a mask with owner rwx plus group/other permissions (0755)", () => {
    expect(isValidFolderPermissionMask("0755")).toBe(true);
    expect(isValidFolderPermissionMask("755")).toBe(true);
  });

  it("rejects malformed masks (non-octal digits, too long, empty)", () => {
    expect(isValidFolderPermissionMask("")).toBe(false);
    expect(isValidFolderPermissionMask("abc")).toBe(false);
    expect(isValidFolderPermissionMask("889")).toBe(false);
    expect(isValidFolderPermissionMask("07555")).toBe(false);
  });
});

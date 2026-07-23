import { describe, expect, it, afterEach } from "vitest";
import {
  validateAgainstRecycleBin,
  validateAgainstStartupFolder,
  getSystemFolders,
  validateAgainstSystemFolders,
} from "../../paths/systemFolderValidators.js";

/**
 * Translated from NzbDrone.Core.Test/ValidationTests/SystemFolderValidatorFixture.cs
 * (the Windows/macOS/Linux system-folder cases) plus new coverage for
 * RecycleBinValidator/StartupFolderValidator, which share the same
 * set-to/child-of shape but have no dedicated C# fixture of their own.
 */

describe("validateAgainstRecycleBin", () => {
  it("is valid when the path is null/undefined", () => {
    expect(validateAgainstRecycleBin("/recycle", null).isValid).toBe(true);
    expect(validateAgainstRecycleBin("/recycle", undefined).isValid).toBe(true);
  });

  it("is valid when no recycle bin is configured (empty/blank)", () => {
    expect(validateAgainstRecycleBin("", "/recycle").isValid).toBe(true);
    expect(validateAgainstRecycleBin("   ", "/recycle").isValid).toBe(true);
    expect(validateAgainstRecycleBin(null, "/recycle").isValid).toBe(true);
  });

  it("is invalid with relationship 'set to' when the path equals the recycle bin", () => {
    const result = validateAgainstRecycleBin("/recycle", "/recycle");
    expect(result.isValid).toBe(false);
    expect(result.relationship).toBe("set to");
  });

  it("is invalid with relationship 'child of' when the path is inside the recycle bin", () => {
    const result = validateAgainstRecycleBin("/recycle", "/recycle/sub");
    expect(result.isValid).toBe(false);
    expect(result.relationship).toBe("child of");
  });

  it("is valid when unrelated to the recycle bin", () => {
    expect(validateAgainstRecycleBin("/recycle", "/books").isValid).toBe(true);
  });
});

describe("validateAgainstStartupFolder", () => {
  it("is valid when the path is null/undefined", () => {
    const appFolderInfo = { startUpFolder: "/opt/pagarr" };
    expect(validateAgainstStartupFolder(appFolderInfo, null).isValid).toBe(true);
  });

  it("is invalid with relationship 'set to' when the path equals the startup folder", () => {
    const appFolderInfo = { startUpFolder: "/opt/pagarr" };
    const result = validateAgainstStartupFolder(appFolderInfo, "/opt/pagarr");
    expect(result.isValid).toBe(false);
    expect(result.relationship).toBe("set to");
  });

  it("is invalid with relationship 'child of' when the path is inside the startup folder", () => {
    const appFolderInfo = { startUpFolder: "/opt/pagarr" };
    const result = validateAgainstStartupFolder(appFolderInfo, "/opt/pagarr/data");
    expect(result.isValid).toBe(false);
    expect(result.relationship).toBe("child of");
  });

  it("is valid when unrelated to the startup folder", () => {
    const appFolderInfo = { startUpFolder: "/opt/pagarr" };
    expect(validateAgainstStartupFolder(appFolderInfo, "/books").isValid).toBe(true);
  });
});

describe("getSystemFolders", () => {
  const originalPlatform = process.platform;
  const originalSystemRoot = process.env["SystemRoot"];

  afterEach(() => {
    Object.defineProperty(process, "platform", { value: originalPlatform });
    if (originalSystemRoot === undefined) {
      delete process.env["SystemRoot"];
    } else {
      process.env["SystemRoot"] = originalSystemRoot;
    }
  });

  it("returns SystemRoot on Windows", () => {
    Object.defineProperty(process, "platform", { value: "win32" });
    process.env["SystemRoot"] = "C:\\Windows";
    expect(getSystemFolders()).toEqual(["C:\\Windows"]);
  });

  it("falls back to C:\\Windows when SystemRoot is unset", () => {
    Object.defineProperty(process, "platform", { value: "win32" });
    delete process.env["SystemRoot"];
    expect(getSystemFolders()).toEqual(["C:\\Windows"]);
  });

  it("returns /System on macOS", () => {
    Object.defineProperty(process, "platform", { value: "darwin" });
    expect(getSystemFolders()).toEqual(["/System"]);
  });

  it("returns the Linux system folder list otherwise", () => {
    Object.defineProperty(process, "platform", { value: "linux" });
    expect(getSystemFolders()).toEqual(["/bin", "/boot", "/lib", "/sbin", "/proc", "/usr/bin"]);
  });
});

describe("validateAgainstSystemFolders", () => {
  const originalPlatform = process.platform;
  const originalSystemRoot = process.env["SystemRoot"];

  afterEach(() => {
    Object.defineProperty(process, "platform", { value: originalPlatform });
    if (originalSystemRoot === undefined) {
      delete process.env["SystemRoot"];
    } else {
      process.env["SystemRoot"] = originalSystemRoot;
    }
  });

  // Translated: should_not_be_valid_if_set_to_windows_folder
  it("is invalid when set to the Windows folder", () => {
    Object.defineProperty(process, "platform", { value: "win32" });
    process.env["SystemRoot"] = "C:\\Windows";
    const result = validateAgainstSystemFolders("C:\\Windows");
    expect(result.isValid).toBe(false);
    expect(result.relationship).toBe("set to");
  });

  // Translated: should_not_be_valid_if_child_of_windows_folder
  it("is invalid when a child of the Windows folder", () => {
    Object.defineProperty(process, "platform", { value: "win32" });
    process.env["SystemRoot"] = "C:\\Windows";
    const result = validateAgainstSystemFolders("C:\\Windows\\Test");
    expect(result.isValid).toBe(false);
    expect(result.relationship).toBe("child of");
  });

  // Translated: should_not_be_valid_if_set_to_bin_folder (posix branch, using Linux since darwin/linux differ only in which folder)
  it("is invalid when set to a Linux system folder", () => {
    Object.defineProperty(process, "platform", { value: "linux" });
    const result = validateAgainstSystemFolders("/bin");
    expect(result.isValid).toBe(false);
    expect(result.relationship).toBe("set to");
  });

  // Translated: should_not_be_valid_if_child_of_bin_folder
  it("is invalid when a child of a Linux system folder", () => {
    Object.defineProperty(process, "platform", { value: "linux" });
    const result = validateAgainstSystemFolders("/bin/test");
    expect(result.isValid).toBe(false);
    expect(result.relationship).toBe("child of");
  });

  it("is invalid when set to the macOS /System folder", () => {
    Object.defineProperty(process, "platform", { value: "darwin" });
    const result = validateAgainstSystemFolders("/System");
    expect(result.isValid).toBe(false);
    expect(result.relationship).toBe("set to");
  });

  it("is valid for an ordinary, unrelated folder", () => {
    Object.defineProperty(process, "platform", { value: "linux" });
    const result = validateAgainstSystemFolders("/mnt/media/Books");
    expect(result.isValid).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import { isNotMappedNetworkDriveUnderWindowsService } from "../../paths/mappedNetworkDriveValidator.js";

/**
 * Translated behavior tests for MappedNetworkDriveValidator. No direct C#
 * fixture exists for it (it's guarded behind IsWindowsService, which is
 * awkward to exercise in the real NUnit suite too -- there's no dedicated
 * fixture there either).
 */

describe("isNotMappedNetworkDriveUnderWindowsService", () => {
  it("is invalid for null/undefined regardless of platform", () => {
    const runtimeInfo = { isWindowsService: true };
    const diskProvider = { getMount: () => ({ driveType: "network" as const }) };
    expect(isNotMappedNetworkDriveUnderWindowsService(true, runtimeInfo, diskProvider, null)).toBe(
      false
    );
  });

  it("is valid on non-Windows regardless of anything else", () => {
    const runtimeInfo = { isWindowsService: true };
    const diskProvider = { getMount: () => ({ driveType: "network" as const }) };
    expect(
      isNotMappedNetworkDriveUnderWindowsService(false, runtimeInfo, diskProvider, "Z:\\books")
    ).toBe(true);
  });

  it("is valid on Windows when NOT running as a Windows service", () => {
    const runtimeInfo = { isWindowsService: false };
    const diskProvider = { getMount: () => ({ driveType: "network" as const }) };
    expect(
      isNotMappedNetworkDriveUnderWindowsService(true, runtimeInfo, diskProvider, "Z:\\books")
    ).toBe(true);
  });

  it("is valid on Windows-service when the path doesn't look like a drive letter", () => {
    const runtimeInfo = { isWindowsService: true };
    const diskProvider = { getMount: () => ({ driveType: "network" as const }) };
    expect(
      isNotMappedNetworkDriveUnderWindowsService(
        true,
        runtimeInfo,
        diskProvider,
        "\\\\server\\share\\books"
      )
    ).toBe(true);
  });

  it("is invalid on Windows-service when the drive-letter path resolves to a network mount", () => {
    const runtimeInfo = { isWindowsService: true };
    const diskProvider = { getMount: () => ({ driveType: "network" as const }) };
    expect(
      isNotMappedNetworkDriveUnderWindowsService(true, runtimeInfo, diskProvider, "Z:\\books")
    ).toBe(false);
  });

  it("is valid on Windows-service when the drive-letter path resolves to a fixed mount", () => {
    const runtimeInfo = { isWindowsService: true };
    const diskProvider = { getMount: () => ({ driveType: "fixed" as const }) };
    expect(
      isNotMappedNetworkDriveUnderWindowsService(true, runtimeInfo, diskProvider, "C:\\books")
    ).toBe(true);
  });

  it("is valid on Windows-service when the mount lookup returns null/undefined", () => {
    const runtimeInfo = { isWindowsService: true };
    const diskProvider = { getMount: () => null };
    expect(
      isNotMappedNetworkDriveUnderWindowsService(true, runtimeInfo, diskProvider, "C:\\books")
    ).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import { DiskSpaceService, SPECIAL_DRIVE_PATTERN } from "../diskSpaceService.js";
import type { IDiskProvider } from "../../root-folders/disk-provider.js";
import type { IRootFolderService } from "../../root-folders/root-folder-service.js";
import type { RootFolder } from "../../root-folders/root-folder.js";

function rootFolder(path: string): RootFolder {
  return {
    id: 1,
    name: "Books",
    path,
    defaultMetadataProfileId: 1,
    defaultQualityProfileId: 1,
    defaultMonitorOption: 0,
    defaultNewItemMonitorOption: 0,
    defaultTags: new Set(),
    isCalibreLibrary: false,
    calibreSettings: null,
    accessible: false,
    freeSpace: null,
    totalSpace: null,
  };
}

describe("DiskSpaceService", () => {
  it("returns free space for each distinct, existing root-folder path", () => {
    const diskProvider: IDiskProvider = {
      folderExists: () => true,
      folderWritable: () => Promise.resolve(true),
      getAvailableSpace: () => 100,
      getTotalSize: () => 1000,
    };
    const rootFolderService: IRootFolderService = {
      all: () => [rootFolder("/books"), rootFolder("/books")], // duplicate path
      allWithSpaceStats: () => Promise.resolve([]),
      add: () => Promise.reject(new Error("not used")),
      update: () => Promise.reject(new Error("not used")),
      remove: () => {},
      get: () => Promise.reject(new Error("not used")),
      allForTag: () => [],
      getBestRootFolder: () => undefined,
      getBestRootFolderPath: (p) => p,
    };

    const service = new DiskSpaceService(diskProvider, rootFolderService);

    expect(service.getFreeSpace()).toEqual([
      { path: "/books", freeSpace: 100, totalSpace: 1000, label: "" },
    ]);
  });

  it("skips a path whose probe returns null for free or total space", () => {
    const diskProvider: IDiskProvider = {
      folderExists: () => true,
      folderWritable: () => Promise.resolve(true),
      getAvailableSpace: () => null,
      getTotalSize: () => 1000,
    };
    const rootFolderService: IRootFolderService = {
      all: () => [rootFolder("/unreachable")],
      allWithSpaceStats: () => Promise.resolve([]),
      add: () => Promise.reject(new Error("not used")),
      update: () => Promise.reject(new Error("not used")),
      remove: () => {},
      get: () => Promise.reject(new Error("not used")),
      allForTag: () => [],
      getBestRootFolder: () => undefined,
      getBestRootFolderPath: (p) => p,
    };

    const service = new DiskSpaceService(diskProvider, rootFolderService);

    expect(service.getFreeSpace()).toEqual([]);
  });

  it("excludes a root folder path that doesn't exist on disk", () => {
    const diskProvider: IDiskProvider = {
      folderExists: () => false,
      folderWritable: () => Promise.resolve(true),
      getAvailableSpace: () => 100,
      getTotalSize: () => 1000,
    };
    const rootFolderService: IRootFolderService = {
      all: () => [rootFolder("/missing")],
      allWithSpaceStats: () => Promise.resolve([]),
      add: () => Promise.reject(new Error("not used")),
      update: () => Promise.reject(new Error("not used")),
      remove: () => {},
      get: () => Promise.reject(new Error("not used")),
      allForTag: () => [],
      getBestRootFolder: () => undefined,
      getBestRootFolderPath: (p) => p,
    };

    const service = new DiskSpaceService(diskProvider, rootFolderService);

    expect(service.getFreeSpace()).toEqual([]);
  });

  it("includes optional fixed-disk mounts (suppressing warnings) when a MountProvider is supplied", () => {
    const diskProvider: IDiskProvider = {
      folderExists: () => true,
      folderWritable: () => Promise.resolve(true),
      getAvailableSpace: (path) => (path === "/books" ? 100 : 500),
      getTotalSize: (path) => (path === "/books" ? 1000 : 2000),
    };
    const rootFolderService: IRootFolderService = {
      all: () => [rootFolder("/books")],
      allWithSpaceStats: () => Promise.resolve([]),
      add: () => Promise.reject(new Error("not used")),
      update: () => Promise.reject(new Error("not used")),
      remove: () => {},
      get: () => Promise.reject(new Error("not used")),
      allForTag: () => [],
      getBestRootFolder: () => undefined,
      getBestRootFolderPath: (p) => p,
    };
    const mountProvider = {
      getMounts: () => [
        { rootDirectory: "/books", driveType: "fixed" as const }, // already covered by root folders
        { rootDirectory: "/data", driveType: "fixed" as const },
        { rootDirectory: "/var/lib/docker", driveType: "fixed" as const }, // excluded by SPECIAL_DRIVE_PATTERN
        { rootDirectory: "/usb", driveType: "removable" as const }, // excluded, not fixed
      ],
      getVolumeLabel: (path: string) => (path === "/data" ? "Data Drive" : ""),
    };

    const service = new DiskSpaceService(diskProvider, rootFolderService, mountProvider);

    expect(service.getFreeSpace()).toEqual([
      { path: "/books", freeSpace: 100, totalSpace: 1000, label: "" },
      { path: "/data", freeSpace: 500, totalSpace: 2000, label: "Data Drive" },
    ]);
  });

  it("SPECIAL_DRIVE_PATTERN matches known container/boot mount paths", () => {
    expect(SPECIAL_DRIVE_PATTERN.test("/var/lib/docker/overlay2")).toBe(true);
    expect(SPECIAL_DRIVE_PATTERN.test("/boot/efi")).toBe(true);
    expect(SPECIAL_DRIVE_PATTERN.test("/etc")).toBe(true);
    expect(SPECIAL_DRIVE_PATTERN.test("/docker/var/aufs")).toBe(true);
    expect(SPECIAL_DRIVE_PATTERN.test("/data")).toBe(false);
  });
});

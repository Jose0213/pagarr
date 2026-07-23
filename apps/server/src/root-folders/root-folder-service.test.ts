import { describe, expect, it, vi } from "vitest";
import { RootFolderService } from "./root-folder-service.js";
import type { IRootFolderRepository } from "./root-folder-repository.js";
import type { IDiskProvider } from "./disk-provider.js";
import { MonitorType, NewItemMonitorType, type RootFolder } from "./root-folder.js";
import {
  DirectoryNotFoundError,
  InvalidPathError,
  RootFolderAlreadyExistsError,
  UnauthorizedAccessError,
} from "./errors.js";

/**
 * Ported test cases from Readarr's actual RootFolderServiceFixture (NUnit),
 * translated to vitest: VerifyRootFolder's invalid-path/missing-dir/
 * not-writable/already-exists rejections, GetBestRootFolder's longest-match
 * selection, GetBestRootFolderPath's no-match fallback, and AllWithSpaceStats'
 * swallow-and-continue error handling.
 */

function baseFolder(overrides: Partial<RootFolder> = {}): RootFolder {
  return {
    id: 0,
    name: "Books",
    path: "/books",
    defaultMetadataProfileId: 1,
    defaultQualityProfileId: 1,
    defaultMonitorOption: MonitorType.All,
    defaultNewItemMonitorOption: NewItemMonitorType.New,
    defaultTags: new Set<number>(),
    isCalibreLibrary: false,
    calibreSettings: null,
    accessible: false,
    freeSpace: null,
    totalSpace: null,
    ...overrides,
  };
}

function makeFakeRepository(initial: RootFolder[] = []): IRootFolderRepository {
  let rows = [...initial];
  let nextId = Math.max(0, ...rows.map((r) => r.id)) + 1;

  return {
    all: () => rows.map((r) => ({ ...r })),
    find: (id) => rows.find((r) => r.id === id),
    get: (id) => {
      const found = rows.find((r) => r.id === id);
      if (!found) {
        throw new Error(`RootFolders with ID ${id} does not exist`);
      }
      return { ...found };
    },
    getMany: (ids) => rows.filter((r) => ids.includes(r.id)),
    insert: (model) => {
      const inserted = { ...model, id: nextId++ };
      rows.push(inserted);
      return inserted;
    },
    update: (model) => {
      rows = rows.map((r) => (r.id === model.id ? { ...model } : r));
      return model;
    },
    delete: (id) => {
      rows = rows.filter((r) => r.id !== id);
    },
    count: () => rows.length,
    hasItems: () => rows.length > 0,
  };
}

function makeFakeDiskProvider(overrides: Partial<IDiskProvider> = {}): IDiskProvider {
  return {
    folderExists: () => true,
    folderWritable: async () => true,
    getAvailableSpace: () => 1000,
    getTotalSize: () => 2000,
    ...overrides,
  };
}

describe("RootFolderService.add / verifyRootFolder", () => {
  it("throws InvalidPathError for an empty path", async () => {
    const service = new RootFolderService(makeFakeRepository(), makeFakeDiskProvider());

    await expect(service.add(baseFolder({ path: "" }))).rejects.toThrow(InvalidPathError);
  });

  it("throws InvalidPathError for a non-rooted (relative) path", async () => {
    const service = new RootFolderService(makeFakeRepository(), makeFakeDiskProvider());

    await expect(service.add(baseFolder({ path: "relative/books" }))).rejects.toThrow(
      InvalidPathError
    );
  });

  it("throws DirectoryNotFoundError when the folder doesn't exist on disk", async () => {
    const disk = makeFakeDiskProvider({ folderExists: () => false });
    const service = new RootFolderService(makeFakeRepository(), disk);

    await expect(service.add(baseFolder())).rejects.toThrow(DirectoryNotFoundError);
  });

  it("throws UnauthorizedAccessError when the folder isn't writable", async () => {
    const disk = makeFakeDiskProvider({ folderWritable: async () => false });
    const service = new RootFolderService(makeFakeRepository(), disk);

    await expect(service.add(baseFolder())).rejects.toThrow(UnauthorizedAccessError);
  });

  it("throws RootFolderAlreadyExistsError for a path that's already configured", async () => {
    const existing = baseFolder({ id: 1, path: "/books" });
    const service = new RootFolderService(makeFakeRepository([existing]), makeFakeDiskProvider());

    await expect(service.add(baseFolder({ path: "/books" }))).rejects.toThrow(
      RootFolderAlreadyExistsError
    );
  });

  it("adds a valid, unique, writable root folder and populates disk stats", async () => {
    const repo = makeFakeRepository();
    const disk = makeFakeDiskProvider({ getAvailableSpace: () => 555, getTotalSize: () => 999 });
    const service = new RootFolderService(repo, disk);

    const added = await service.add(baseFolder());

    expect(added.id).toBeGreaterThan(0);
    expect(added.accessible).toBe(true);
    expect(added.freeSpace).toBe(555);
    expect(added.totalSpace).toBe(999);
  });

  it("fires onRootFolderAdded with the new folder's path (stand-in for RescanFoldersCommand push)", async () => {
    const onRootFolderAdded = vi.fn();
    const service = new RootFolderService(makeFakeRepository(), makeFakeDiskProvider(), {
      onRootFolderAdded,
    });

    await service.add(baseFolder({ path: "/books" }));

    expect(onRootFolderAdded).toHaveBeenCalledWith("/books");
  });
});

describe("RootFolderService.update", () => {
  it("re-verifies the path and re-populates disk stats", async () => {
    const existing = baseFolder({ id: 1, path: "/books" });
    const repo = makeFakeRepository([existing]);
    const disk = makeFakeDiskProvider({ getAvailableSpace: () => 42 });
    const service = new RootFolderService(repo, disk);

    const updated = await service.update({ ...existing, name: "Renamed" });

    expect(updated.name).toBe("Renamed");
    expect(updated.freeSpace).toBe(42);
  });

  it("rejects an update whose path no longer exists on disk", async () => {
    const existing = baseFolder({ id: 1, path: "/books" });
    const repo = makeFakeRepository([existing]);
    const disk = makeFakeDiskProvider({ folderExists: () => false });
    const service = new RootFolderService(repo, disk);

    await expect(service.update(existing)).rejects.toThrow(DirectoryNotFoundError);
  });
});

describe("RootFolderService.remove/get/all/allForTag", () => {
  it("remove() deletes by id", () => {
    const existing = baseFolder({ id: 1, path: "/books" });
    const repo = makeFakeRepository([existing]);
    const service = new RootFolderService(repo, makeFakeDiskProvider());

    service.remove(1);

    expect(repo.find(1)).toBeUndefined();
  });

  it("get() returns the folder with disk stats populated", async () => {
    const existing = baseFolder({ id: 1, path: "/books" });
    const repo = makeFakeRepository([existing]);
    const service = new RootFolderService(
      repo,
      makeFakeDiskProvider({ getAvailableSpace: () => 7 })
    );

    const result = await service.get(1);

    expect(result.freeSpace).toBe(7);
  });

  it("all() returns every root folder without disk stats", () => {
    const repo = makeFakeRepository([
      baseFolder({ id: 1, path: "/books" }),
      baseFolder({ id: 2, path: "/audiobooks" }),
    ]);
    const service = new RootFolderService(repo, makeFakeDiskProvider());

    expect(service.all()).toHaveLength(2);
  });

  it("allForTag() filters to root folders whose DefaultTags contains the given tag", () => {
    const repo = makeFakeRepository([
      baseFolder({ id: 1, path: "/books", defaultTags: new Set([1, 2]) }),
      baseFolder({ id: 2, path: "/audiobooks", defaultTags: new Set([3]) }),
    ]);
    const service = new RootFolderService(repo, makeFakeDiskProvider());

    const result = service.allForTag(2);

    expect(result).toHaveLength(1);
    expect(result[0]!.path).toBe("/books");
  });
});

describe("RootFolderService.allWithSpaceStats", () => {
  it("populates disk stats for every rooted root folder", async () => {
    const repo = makeFakeRepository([
      baseFolder({ id: 1, path: "/books" }),
      baseFolder({ id: 2, path: "/audiobooks" }),
    ]);
    const service = new RootFolderService(
      repo,
      makeFakeDiskProvider({ getAvailableSpace: () => 123 })
    );

    const result = await service.allWithSpaceStats();

    expect(result.every((r) => r.freeSpace === 123)).toBe(true);
  });

  it("skips folders whose path isn't rooted (matches C#'s IsPathValid guard)", async () => {
    const repo = makeFakeRepository([baseFolder({ id: 1, path: "relative-path" })]);
    const disk = makeFakeDiskProvider();
    const getAvailableSpaceSpy = vi.spyOn(disk, "getAvailableSpace");
    const service = new RootFolderService(repo, disk);

    await service.allWithSpaceStats();

    expect(getAvailableSpaceSpy).not.toHaveBeenCalled();
  });

  it("swallows a per-folder disk error via onError so other folders still load", async () => {
    const repo = makeFakeRepository([
      baseFolder({ id: 1, path: "/broken" }),
      baseFolder({ id: 2, path: "/ok" }),
    ]);
    const disk = makeFakeDiskProvider({
      folderExists: (path) => {
        if (path === "/broken") {
          throw new Error("disk error");
        }
        return true;
      },
    });
    const onError = vi.fn();
    const service = new RootFolderService(repo, disk, { onError });

    const result = await service.allWithSpaceStats();

    expect(result).toHaveLength(2);
    expect(onError).toHaveBeenCalledWith("/broken", expect.any(Error));
  });
});

describe("RootFolderService.getBestRootFolder / getBestRootFolderPath", () => {
  it("returns the root folder matching the path exactly", () => {
    const folders = [baseFolder({ id: 1, path: "/books" })];
    const service = new RootFolderService(makeFakeRepository(folders), makeFakeDiskProvider());

    expect(service.getBestRootFolder("/books", folders)?.id).toBe(1);
  });

  it("returns the longest matching ancestor when multiple root folders are parents of the path", () => {
    const folders = [
      baseFolder({ id: 1, path: "/media" }),
      baseFolder({ id: 2, path: "/media/books" }),
    ];
    const service = new RootFolderService(makeFakeRepository(folders), makeFakeDiskProvider());

    const best = service.getBestRootFolder("/media/books/author/title", folders);

    expect(best?.id).toBe(2);
  });

  it("returns undefined when no root folder matches", () => {
    const folders = [baseFolder({ id: 1, path: "/books" })];
    const service = new RootFolderService(makeFakeRepository(folders), makeFakeDiskProvider());

    expect(service.getBestRootFolder("/unrelated/path", folders)).toBeUndefined();
  });

  it("getBestRootFolderPath returns the matching root folder's path", () => {
    const folders = [baseFolder({ id: 1, path: "/media/books" })];
    const service = new RootFolderService(makeFakeRepository(folders), makeFakeDiskProvider());

    expect(service.getBestRootFolderPath("/media/books/author", folders)).toBe("/media/books");
  });

  it("getBestRootFolderPath falls back to the path's own directory when no root folder matches", () => {
    const service = new RootFolderService(makeFakeRepository([]), makeFakeDiskProvider());

    expect(service.getBestRootFolderPath("/unrelated/author/book.epub", [])).toBe(
      "/unrelated/author"
    );
  });

  it("getBestRootFolderPath fallback strips a trailing separator", () => {
    const service = new RootFolderService(makeFakeRepository([]), makeFakeDiskProvider());

    expect(service.getBestRootFolderPath("/unrelated/author/", [])).toBe("/unrelated");
  });

  it("getBestRootFolderPath fallback handles a Windows-style path", () => {
    const service = new RootFolderService(makeFakeRepository([]), makeFakeDiskProvider());

    expect(service.getBestRootFolderPath("C:\\Media\\Books\\author", [])).toBe("C:\\Media\\Books");
  });

  it("uses service.all() when allRootFolders isn't passed", () => {
    const folders = [baseFolder({ id: 1, path: "/books" })];
    const service = new RootFolderService(makeFakeRepository(folders), makeFakeDiskProvider());

    expect(service.getBestRootFolder("/books")?.id).toBe(1);
  });
});

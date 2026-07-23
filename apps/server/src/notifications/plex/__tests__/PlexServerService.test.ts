import { describe, expect, it, vi } from "vitest";
import { PlexServerService } from "../server/PlexServerService.js";
import { PlexAuthenticationException, PlexVersionException } from "../PlexException.js";
import type { IPlexServerProxy } from "../server/PlexServerProxy.js";
import { createPlexServerSettings } from "../server/PlexServerSettings.js";
import type { IRootFolderService } from "../../../root-folders/root-folder-service.js";
import { noopLogger, testAuthor } from "../../__tests__/testFixtures.js";

function fakeProxy(overrides: Partial<IPlexServerProxy> = {}): IPlexServerProxy {
  return {
    getTvSections: vi.fn(async () => []),
    version: vi.fn(async () => "1.2.0.0"),
    update: vi.fn(async () => {}),
    ...overrides,
  };
}

function fakeRootFolderService(bestPath = "C:\\Authors"): IRootFolderService {
  return {
    all: () => [],
    allWithSpaceStats: async () => [],
    add: async (rf) => rf,
    update: async (rf) => rf,
    remove: () => {},
    get: async () => {
      throw new Error("not implemented");
    },
    allForTag: () => [],
    getBestRootFolder: () => undefined,
    getBestRootFolderPath: () => bestPath,
  };
}

describe("PlexServerService.updateLibraryForAuthors", () => {
  it("throws PlexVersionException for the exact broken PMS range [1.3.0, 1.3.1)", async () => {
    const proxy = fakeProxy({ version: vi.fn(async () => "1.3.0.0-abc123de") });
    const service = new PlexServerService(proxy, fakeRootFolderService(), noopLogger());
    const settings = createPlexServerSettings({ host: "plex.local" });

    await expect(
      service.updateLibraryForAuthors([testAuthor({ path: "C:\\Authors\\A" })], settings)
    ).rejects.toThrow(PlexVersionException);
  });

  it("does not throw for a version just below the broken range", async () => {
    const proxy = fakeProxy({ version: vi.fn(async () => "1.2.9.0-abc123de") });
    const service = new PlexServerService(proxy, fakeRootFolderService(), noopLogger());
    const settings = createPlexServerSettings({ host: "plex.local" });

    await expect(
      service.updateLibraryForAuthors([testAuthor({ path: "C:\\Authors\\A" })], settings)
    ).resolves.toBeUndefined();
  });

  it("does not throw for a version at the top of the broken range (1.3.1 exactly)", async () => {
    const proxy = fakeProxy({ version: vi.fn(async () => "1.3.1.0-abc123de") });
    const service = new PlexServerService(proxy, fakeRootFolderService(), noopLogger());
    const settings = createPlexServerSettings({ host: "plex.local" });

    await expect(
      service.updateLibraryForAuthors([testAuthor({ path: "C:\\Authors\\A" })], settings)
    ).resolves.toBeUndefined();
  });

  it("caches the version per host so a second call within the TTL does not re-fetch", async () => {
    const versionFn = vi.fn(async () => "1.2.0.0");
    const proxy = fakeProxy({ version: versionFn });
    const service = new PlexServerService(proxy, fakeRootFolderService(), noopLogger());
    const settings = createPlexServerSettings({ host: "plex.local" });
    const author = testAuthor({ path: "C:\\Authors\\A" });

    await service.updateLibraryForAuthors([author], settings);
    await service.updateLibraryForAuthors([author], settings);

    expect(versionFn).toHaveBeenCalledTimes(1);
  });

  it("re-fetches the version for a different host", async () => {
    const versionFn = vi.fn(async () => "1.2.0.0");
    const proxy = fakeProxy({ version: versionFn });
    const service = new PlexServerService(proxy, fakeRootFolderService(), noopLogger());
    const author = testAuthor({ path: "C:\\Authors\\A" });

    await service.updateLibraryForAuthors([author], createPlexServerSettings({ host: "plex-a" }));
    await service.updateLibraryForAuthors([author], createPlexServerSettings({ host: "plex-b" }));

    expect(versionFn).toHaveBeenCalledTimes(2);
  });

  it("updates every section location when no location matches the mapped root folder path", async () => {
    const updateFn = vi.fn(async () => {});
    const proxy = fakeProxy({
      getTvSections: vi.fn(async () => [
        {
          id: 1,
          type: "artist",
          language: null,
          locations: [
            { id: 10, path: "/music/one" },
            { id: 11, path: "/music/two" },
          ],
        },
      ]),
      update: updateFn,
    });
    const service = new PlexServerService(
      proxy,
      fakeRootFolderService("/some/unrelated/root"),
      noopLogger()
    );
    const settings = createPlexServerSettings({ host: "plex.local" });

    await service.updateLibraryForAuthors(
      [testAuthor({ path: "/some/unrelated/root/Author Name" })],
      settings
    );

    expect(updateFn).toHaveBeenCalledTimes(2);
  });

  it("propagates and logs errors from the underlying calls, matching the C# catch/rethrow", async () => {
    const proxy = fakeProxy({
      getTvSections: vi.fn(async () => {
        throw new Error("boom");
      }),
    });
    const logger = noopLogger();
    const warnSpy = vi.spyOn(logger, "warn");
    const service = new PlexServerService(proxy, fakeRootFolderService(), logger);
    const settings = createPlexServerSettings({ host: "plex.local" });

    await expect(service.updateLibraryForAuthors([testAuthor()], settings)).rejects.toThrow("boom");
    expect(warnSpy).toHaveBeenCalled();
  });
});

describe("PlexServerService.test", () => {
  it("returns a Host failure when there are zero music sections", async () => {
    const proxy = fakeProxy({ getTvSections: vi.fn(async () => []) });
    const service = new PlexServerService(proxy, fakeRootFolderService(), noopLogger());
    const settings = createPlexServerSettings({ host: "plex.local" });

    const failure = await service.test(settings);

    expect(failure).not.toBeNull();
    expect(failure?.propertyName).toBe("Host");
    expect(failure?.errorMessage).toContain("Music library");
  });

  it("returns null (success) when at least one section exists", async () => {
    const proxy = fakeProxy({
      getTvSections: vi.fn(async () => [{ id: 1, type: "artist", language: null, locations: [] }]),
    });
    const service = new PlexServerService(proxy, fakeRootFolderService(), noopLogger());
    const settings = createPlexServerSettings({ host: "plex.local" });

    expect(await service.test(settings)).toBeNull();
  });

  it("maps PlexAuthenticationException to an AuthToken failure", async () => {
    const proxy = fakeProxy({
      getTvSections: vi.fn(async () => {
        throw new PlexAuthenticationException("nope");
      }),
    });
    const service = new PlexServerService(proxy, fakeRootFolderService(), noopLogger());
    const settings = createPlexServerSettings({ host: "plex.local" });

    const failure = await service.test(settings);
    expect(failure?.propertyName).toBe("AuthToken");
  });
});

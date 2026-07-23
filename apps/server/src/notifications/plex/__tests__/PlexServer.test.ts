import { describe, expect, it, vi } from "vitest";
import { PlexServer } from "../server/PlexServer.js";
import type { IPlexServerService } from "../server/PlexServerService.js";
import type { IPlexTvService } from "../plextv/PlexTvService.js";
import { createPlexServerSettings } from "../server/PlexServerSettings.js";
import { createNotificationDefinition } from "../../NotificationDefinition.js";
import { createAuthorDeleteMessage } from "../../AuthorDeleteMessage.js";
import { createBookDeleteMessage } from "../../BookDeleteMessage.js";
import { noopLogger, testAuthor, testBook } from "../../__tests__/testFixtures.js";

function fakePlexServerService(overrides: Partial<IPlexServerService> = {}): IPlexServerService {
  return {
    updateLibrary: vi.fn(async () => {}),
    updateLibraryForAuthors: vi.fn(async () => {}),
    test: vi.fn(async () => null),
    ...overrides,
  };
}

function fakePlexTvService(overrides: Partial<IPlexTvService> = {}): IPlexTvService {
  return {
    getPinUrl: vi.fn(() => ({ url: "https://plex.tv/pin", method: "POST" as const, headers: {} })),
    getSignInUrl: vi.fn(() => ({ oauthUrl: "https://app.plex.tv/sign-in", pinId: 1 })),
    getAuthToken: vi.fn(async () => "token"),
    ping: vi.fn(async () => {}),
    ...overrides,
  };
}

function buildServer(
  plexServerService: IPlexServerService = fakePlexServerService(),
  plexTvService: IPlexTvService = fakePlexTvService(),
  settingsOverrides: Parameters<typeof createPlexServerSettings>[0] = {}
): PlexServer {
  const server = new PlexServer(plexServerService, plexTvService, noopLogger());
  server.definition = createNotificationDefinition({
    settings: createPlexServerSettings({
      host: "plex.local",
      updateLibrary: true,
      ...settingsOverrides,
    }),
  });
  return server;
}

describe("PlexServer queue batching (ported from _pendingAuthorsCache/ProcessQueue)", () => {
  it("queues authors from onReleaseImport without calling updateLibrary until processQueue runs", async () => {
    const service = fakePlexServerService();
    const server = buildServer(service);

    server.onReleaseImport({
      message: "",
      author: testAuthor({ id: 5 }),
      book: testBook(testAuthor()),
      bookFiles: [],
      oldFiles: [],
      downloadClientInfo: null,
      downloadId: null,
    });

    expect(service.updateLibraryForAuthors).not.toHaveBeenCalled();

    await server.processQueue();

    expect(service.updateLibraryForAuthors).toHaveBeenCalledTimes(1);
    expect(service.updateLibraryForAuthors).toHaveBeenCalledWith(
      [expect.objectContaining({ id: 5 })],
      expect.anything()
    );
  });

  it("deduplicates multiple queue entries for the same author id (Dictionary<int, Author> semantics)", async () => {
    const service = fakePlexServerService();
    const server = buildServer(service);

    const author = testAuthor({ id: 7 });
    server.onReleaseImport({
      message: "",
      author,
      book: testBook(testAuthor()),
      bookFiles: [],
      oldFiles: [],
      downloadClientInfo: null,
      downloadId: null,
    });
    server.onRename(author, []);

    await server.processQueue();

    expect(service.updateLibraryForAuthors).toHaveBeenCalledTimes(1);
    expect(service.updateLibraryForAuthors).toHaveBeenCalledWith([author], expect.anything());
  });

  it("does not queue or update when settings.updateLibrary is false", async () => {
    const service = fakePlexServerService();
    const server = buildServer(service, fakePlexTvService(), { updateLibrary: false });

    server.onReleaseImport({
      message: "",
      author: testAuthor(),
      book: testBook(testAuthor()),
      bookFiles: [],
      oldFiles: [],
      downloadClientInfo: null,
      downloadId: null,
    });
    await server.processQueue();

    expect(service.updateLibraryForAuthors).not.toHaveBeenCalled();
  });

  it("processQueue is a no-op when nothing has been queued for that host", async () => {
    const service = fakePlexServerService();
    const server = buildServer(service);

    await server.processQueue();

    expect(service.updateLibraryForAuthors).not.toHaveBeenCalled();
  });

  it("onBookDelete only queues an update when deletedFiles is true", async () => {
    const service = fakePlexServerService();
    const server = buildServer(service);

    const book = testBook(testAuthor());
    server.onBookDelete(createBookDeleteMessage(book, false));
    await server.processQueue();
    expect(service.updateLibraryForAuthors).not.toHaveBeenCalled();

    server.onBookDelete(createBookDeleteMessage(book, true));
    await server.processQueue();
    expect(service.updateLibraryForAuthors).toHaveBeenCalledTimes(1);
  });

  it("onAuthorDelete only queues an update when deletedFiles is true", async () => {
    const service = fakePlexServerService();
    const server = buildServer(service);
    const author = testAuthor();

    server.onAuthorDelete(createAuthorDeleteMessage(author, author.metadata?.name ?? "", false));
    await server.processQueue();
    expect(service.updateLibraryForAuthors).not.toHaveBeenCalled();

    server.onAuthorDelete(createAuthorDeleteMessage(author, author.metadata?.name ?? "", true));
    await server.processQueue();
    expect(service.updateLibraryForAuthors).toHaveBeenCalledTimes(1);
  });

  it("pings plex.tv on every queueing call regardless of updateLibrary", async () => {
    const tvService = fakePlexTvService();
    const server = buildServer(fakePlexServerService(), tvService, { updateLibrary: false });

    server.onReleaseImport({
      message: "",
      author: testAuthor(),
      book: testBook(testAuthor()),
      bookFiles: [],
      oldFiles: [],
      downloadClientInfo: null,
      downloadId: null,
    });

    expect(tvService.ping).toHaveBeenCalled();
  });

  it("marks queue not-refreshing again after a failed updateLibraryForAuthors so a later processQueue can retry", async () => {
    const failingOnce = vi
      .fn()
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValue(undefined);
    const service = fakePlexServerService({ updateLibraryForAuthors: failingOnce });
    const server = buildServer(service);

    server.onReleaseImport({
      message: "",
      author: testAuthor(),
      book: testBook(testAuthor()),
      bookFiles: [],
      oldFiles: [],
      downloadClientInfo: null,
      downloadId: null,
    });

    await expect(server.processQueue()).rejects.toThrow("network down");

    // Requeue and retry -- should not be stuck "refreshing" forever.
    server.onReleaseImport({
      message: "",
      author: testAuthor(),
      book: testBook(testAuthor()),
      bookFiles: [],
      oldFiles: [],
      downloadClientInfo: null,
      downloadId: null,
    });
    await server.processQueue();

    expect(failingOnce).toHaveBeenCalledTimes(2);
  });
});

describe("PlexServer.test", () => {
  it("pings plex.tv and delegates to plexServerService.test", async () => {
    const tvService = fakePlexTvService();
    const serverService = fakePlexServerService();
    const server = buildServer(serverService, tvService);

    const result = await server.test();

    expect(tvService.ping).toHaveBeenCalled();
    expect(serverService.test).toHaveBeenCalled();
    expect(result.isValid).toBe(true);
  });

  it("surfaces a failure from plexServerService.test as invalid", async () => {
    const serverService = fakePlexServerService({
      test: vi.fn(async () => ({ propertyName: "Host", errorMessage: "unreachable" })),
    });
    const server = buildServer(serverService);

    const result = await server.test();

    expect(result.isValid).toBe(false);
    expect(result.errors).toHaveLength(1);
  });
});

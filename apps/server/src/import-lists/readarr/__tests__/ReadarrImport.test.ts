import { describe, expect, it, vi } from "vitest";
import type { IImportListStatusService } from "../../ImportListStatusService.js";
import { createImportListDefinition } from "../../ImportListDefinition.js";
import { ReadarrImport } from "../ReadarrImport.js";
import { createReadarrSettings } from "../ReadarrSetting.js";
import type { IReadarrV1Proxy } from "../ReadarrV1Proxy.js";
import type { ReadarrAuthor, ReadarrBook } from "../ReadarrAPIResource.js";

function fakeStatusService(): IImportListStatusService & {
  recordSuccess: ReturnType<typeof vi.fn>;
  recordFailure: ReturnType<typeof vi.fn>;
} {
  return {
    getBlockedProviders: vi.fn(() => []),
    recordSuccess: vi.fn(),
    recordFailure: vi.fn(),
    recordConnectionFailure: vi.fn(),
    getLastSyncListInfo: vi.fn(() => null),
    updateListSyncStatus: vi.fn(),
  };
}

function author(overrides: Partial<ReadarrAuthor> = {}): ReadarrAuthor {
  return {
    authorName: "Brandon Sanderson",
    id: 1,
    foreignAuthorId: "author-1",
    overview: null,
    images: [],
    monitored: true,
    qualityProfileId: 1,
    rootFolderPath: "/books",
    tags: [],
    ...overrides,
  };
}

function book(overrides: Partial<ReadarrBook> = {}): ReadarrBook {
  return {
    title: "The Way of Kings",
    foreignBookId: "book-1",
    foreignEditionId: "edition-1",
    overview: null,
    images: [],
    monitored: true,
    author: null,
    authorId: 1,
    editions: [],
    ...overrides,
  };
}

function fakeProxy(overrides: Partial<IReadarrV1Proxy> = {}): IReadarrV1Proxy {
  return {
    getAuthors: vi.fn(async () => []),
    getBooks: vi.fn(async () => []),
    getProfiles: vi.fn(async () => []),
    getRootFolders: vi.fn(async () => []),
    getTags: vi.fn(async () => []),
    test: vi.fn(async () => null),
    ...overrides,
  };
}

function buildSubject(proxy: IReadarrV1Proxy, statusService = fakeStatusService()) {
  const subject = new ReadarrImport(proxy, statusService, undefined as never, undefined);
  subject.definition = createImportListDefinition({
    id: 8,
    name: "Readarr",
    settings: createReadarrSettings({ baseUrl: "http://remote", apiKey: "key" }),
  });
  return { subject, statusService };
}

describe("ReadarrImport", () => {
  it("maps monitored author+book pairs into ImportListItemInfo", async () => {
    const proxy = fakeProxy({
      getAuthors: vi.fn(async () => [author()]),
      getBooks: vi.fn(async () => [book()]),
    });
    const { subject, statusService } = buildSubject(proxy);

    const items = await subject.fetch();

    expect(items).toHaveLength(1);
    expect(items[0]?.author).toBe("Brandon Sanderson");
    expect(items[0]?.authorGoodreadsId).toBe("author-1");
    expect(items[0]?.book).toBe("The Way of Kings");
    expect(statusService.recordSuccess).toHaveBeenCalledWith(8);
  });

  it("excludes a book whose author is not monitored", async () => {
    const proxy = fakeProxy({
      getAuthors: vi.fn(async () => [author({ monitored: false })]),
      getBooks: vi.fn(async () => [book()]),
    });
    const { subject } = buildSubject(proxy);

    expect(await subject.fetch()).toEqual([]);
  });

  it("excludes a book that is itself not monitored", async () => {
    const proxy = fakeProxy({
      getAuthors: vi.fn(async () => [author()]),
      getBooks: vi.fn(async () => [book({ monitored: false })]),
    });
    const { subject } = buildSubject(proxy);

    expect(await subject.fetch()).toEqual([]);
  });

  it("filters by ProfileIds when configured", async () => {
    const proxy = fakeProxy({
      getAuthors: vi.fn(async () => [
        author({ id: 1, qualityProfileId: 5 }),
        author({ id: 2, qualityProfileId: 9 }),
      ]),
      getBooks: vi.fn(async () => [
        book({ authorId: 1 }),
        book({ authorId: 2, foreignBookId: "book-2" }),
      ]),
    });
    const { subject } = buildSubject(proxy);
    subject.definition.settings!.profileIds = [9];

    const items = await subject.fetch();

    expect(items).toHaveLength(1);
    expect(items[0]?.bookGoodreadsId).toBe("book-2");
  });

  it("filters by TagIds when configured", async () => {
    const proxy = fakeProxy({
      getAuthors: vi.fn(async () => [author({ id: 1, tags: [1] }), author({ id: 2, tags: [2] })]),
      getBooks: vi.fn(async () => [
        book({ authorId: 1 }),
        book({ authorId: 2, foreignBookId: "book-2" }),
      ]),
    });
    const { subject } = buildSubject(proxy);
    subject.definition.settings!.tagIds = [2];

    const items = await subject.fetch();

    expect(items).toHaveLength(1);
    expect(items[0]?.bookGoodreadsId).toBe("book-2");
  });

  it("filters by RootFolderPaths (case-insensitive Contains) when configured", async () => {
    const proxy = fakeProxy({
      getAuthors: vi.fn(async () => [
        author({ id: 1, rootFolderPath: "/media/BOOKS/fantasy" }),
        author({ id: 2, rootFolderPath: "/media/nonfiction" }),
      ]),
      getBooks: vi.fn(async () => [
        book({ authorId: 1 }),
        book({ authorId: 2, foreignBookId: "book-2" }),
      ]),
    });
    const { subject } = buildSubject(proxy);
    subject.definition.settings!.rootFolderPaths = ["/books"];

    const items = await subject.fetch();

    expect(items).toHaveLength(1);
    expect(items[0]?.bookGoodreadsId).toBe("book-1");
  });

  it("a book whose AuthorId has no matching author aborts the whole fetch (preserved unguarded-dictionary-index behavior)", async () => {
    const proxy = fakeProxy({
      getAuthors: vi.fn(async () => [author({ id: 1 })]),
      getBooks: vi.fn(async () => [book({ authorId: 999 })]),
    });
    const { subject, statusService } = buildSubject(proxy);

    const items = await subject.fetch();

    expect(items).toEqual([]);
    expect(statusService.recordFailure).toHaveBeenCalledWith(8);
  });

  describe("requestAction", () => {
    it("returns an empty devices list when ApiKey is blank", async () => {
      const proxy = fakeProxy();
      const { subject } = buildSubject(proxy);
      subject.definition.settings!.apiKey = "";

      const result = await subject.requestAction("getProfiles", {});

      expect(result).toEqual({ devices: [] });
    });

    it("getProfiles returns sorted Value/Name options", async () => {
      const proxy = fakeProxy({
        getProfiles: vi.fn(async () => [
          { id: 2, name: "Zeta" },
          { id: 1, name: "Alpha" },
        ]),
      });
      const { subject } = buildSubject(proxy);

      const result = (await subject.requestAction("getProfiles", {})) as {
        options: Array<{ Value: number; Name: string }>;
      };

      expect(result.options.map((o) => o.Name)).toEqual(["Alpha", "Zeta"]);
    });
  });

  it("test() delegates to the proxy", async () => {
    const proxy = fakeProxy({
      test: vi.fn(async () => ({ propertyName: "apiKey", errorMessage: "bad" })),
    });
    const { subject } = buildSubject(proxy);

    const result = await subject.test();

    expect(result.isValid).toBe(false);
    expect(result.errors[0]?.propertyName).toBe("apiKey");
  });
});

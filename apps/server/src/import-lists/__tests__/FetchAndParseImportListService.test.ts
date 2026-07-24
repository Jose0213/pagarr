import { describe, expect, it, vi } from "vitest";
import { FetchAndParseImportListService } from "../FetchAndParseImportListService.js";
import type { IImportListFactory } from "../ImportListFactory.js";
import type { IImportListStatusService } from "../ImportListStatusService.js";
import { createImportListDefinition } from "../ImportListDefinition.js";
import type { IImportList } from "../IImportList.js";
import { ImportListType } from "../ImportListType.js";
import { newImportListItemInfo } from "../../parser/model/importListItemInfo.js";

/**
 * Translated from NzbDrone.Core.Test/ImportListTests/FetchAndParseImportListServiceFixture.cs.
 */
function fakeImportList(overrides: Partial<IImportList> = {}): IImportList {
  return {
    name: "FakeList",
    configContract: "FakeSettings",
    message: null,
    defaultDefinitions: [],
    listType: ImportListType.Other,
    minRefreshIntervalMs: 15 * 60 * 1000,
    definition: createImportListDefinition({ id: 1, name: "FakeList" }),
    test: vi.fn(async () => ({ isValid: true, hasWarnings: false, errors: [] })),
    requestAction: vi.fn(),
    fetch: vi.fn(async () => []),
    ...overrides,
  };
}

function fakeFactory(lists: IImportList[]): IImportListFactory {
  return {
    get: vi.fn((id: number) => lists.find((l) => l.definition.id === id)!.definition as never),
    getInstance: vi.fn((def) => lists.find((l) => l.definition.id === def.id)!),
    getAvailableProviders: vi.fn(() => lists),
    automaticAddEnabled: vi.fn(() => lists),
    test: vi.fn(async () => ({ isValid: true, hasWarnings: false, errors: [] })),
  };
}

function fakeStatusService(lastSync: string | null = null): IImportListStatusService & {
  updateListSyncStatus: ReturnType<typeof vi.fn>;
} {
  return {
    getBlockedProviders: vi.fn(() => []),
    recordSuccess: vi.fn(),
    recordFailure: vi.fn(),
    recordConnectionFailure: vi.fn(),
    getLastSyncListInfo: vi.fn(() => lastSync),
    updateListSyncStatus: vi.fn(),
  };
}

describe("FetchAndParseImportListService", () => {
  describe("fetch()", () => {
    it("returns an empty array immediately when there are no automatic-add-enabled lists", async () => {
      const factory = fakeFactory([]);
      const service = new FetchAndParseImportListService(factory, fakeStatusService());

      const result = await service.fetch();

      expect(result).toEqual([]);
    });

    it("aggregates reports from every enabled list and updates each list's sync status", async () => {
      const itemA = { ...newImportListItemInfo(), author: "Author A", book: "Book A" };
      const itemB = { ...newImportListItemInfo(), author: "Author B", book: "Book B" };
      const listA = fakeImportList({
        definition: createImportListDefinition({ id: 1, name: "ListA" }),
        fetch: vi.fn(async () => [itemA]),
      });
      const listB = fakeImportList({
        definition: createImportListDefinition({ id: 2, name: "ListB" }),
        fetch: vi.fn(async () => [itemB]),
      });
      const factory = fakeFactory([listA, listB]);
      const statusService = fakeStatusService();
      const service = new FetchAndParseImportListService(factory, statusService);

      const result = await service.fetch();

      expect(result).toHaveLength(2);
      expect(statusService.updateListSyncStatus).toHaveBeenCalledWith(1);
      expect(statusService.updateListSyncStatus).toHaveBeenCalledWith(2);
    });

    it("de-duplicates items across all lists by (Author, Book) pair", async () => {
      const dup1 = { ...newImportListItemInfo(), author: "Same", book: "Same" };
      const dup2 = { ...newImportListItemInfo(), author: "Same", book: "Same" };
      const listA = fakeImportList({
        definition: createImportListDefinition({ id: 1, name: "ListA" }),
        fetch: vi.fn(async () => [dup1]),
      });
      const listB = fakeImportList({
        definition: createImportListDefinition({ id: 2, name: "ListB" }),
        fetch: vi.fn(async () => [dup2]),
      });
      const factory = fakeFactory([listA, listB]);
      const service = new FetchAndParseImportListService(factory, fakeStatusService());

      const result = await service.fetch();

      expect(result).toHaveLength(1);
    });

    it("skips a list whose MinRefreshInterval hasn't elapsed since its last sync", async () => {
      const now = Date.now();
      const list = fakeImportList({
        definition: createImportListDefinition({ id: 1, name: "Recent" }),
        minRefreshIntervalMs: 60 * 60 * 1000,
        fetch: vi.fn(async () => [newImportListItemInfo()]),
      });
      const factory = fakeFactory([list]);
      // Last synced 1 minute ago, refresh interval is 1 hour -- should skip.
      const statusService = fakeStatusService(new Date(now - 60 * 1000).toISOString());
      const service = new FetchAndParseImportListService(
        factory,
        statusService,
        undefined,
        () => now
      );

      const result = await service.fetch();

      expect(result).toEqual([]);
      expect(list.fetch).not.toHaveBeenCalled();
    });

    it("does not let one list's fetch failure abort the others", async () => {
      const okItem = { ...newImportListItemInfo(), author: "OK", book: "OK" };
      const failingList = fakeImportList({
        definition: createImportListDefinition({ id: 1, name: "Failing" }),
        fetch: vi.fn(async () => {
          throw new Error("boom");
        }),
      });
      const okList = fakeImportList({
        definition: createImportListDefinition({ id: 2, name: "OK" }),
        fetch: vi.fn(async () => [okItem]),
      });
      const factory = fakeFactory([failingList, okList]);
      const statusService = fakeStatusService();
      const service = new FetchAndParseImportListService(factory, statusService);

      const result = await service.fetch();

      expect(result).toHaveLength(1);
      expect(result[0]?.author).toBe("OK");
      // The failing list's sync status is NOT updated (matches the C#'s catch-block behavior --
      // UpdateListSyncStatus only runs on the success path).
      expect(statusService.updateListSyncStatus).toHaveBeenCalledWith(2);
      expect(statusService.updateListSyncStatus).not.toHaveBeenCalledWith(1);
    });
  });

  describe("fetchSingleList()", () => {
    it("returns empty and does not fetch when the definition has EnableAutomaticAdd=false", async () => {
      const list = fakeImportList();
      const factory = fakeFactory([list]);
      const service = new FetchAndParseImportListService(factory, fakeStatusService());

      const definition = createImportListDefinition({ id: 1, enableAutomaticAdd: false });
      const result = await service.fetchSingleList(definition);

      expect(result).toEqual([]);
      expect(list.fetch).not.toHaveBeenCalled();
    });

    it("fetches and dedups a single list's reports when enabled", async () => {
      const dup = { ...newImportListItemInfo(), author: "A", book: "B" };
      const list = fakeImportList({
        definition: createImportListDefinition({ id: 1, enableAutomaticAdd: true }),
        fetch: vi.fn(async () => [dup, { ...dup }]),
      });
      const factory = fakeFactory([list]);
      const statusService = fakeStatusService();
      const service = new FetchAndParseImportListService(factory, statusService);

      const definition = createImportListDefinition({ id: 1, enableAutomaticAdd: true });
      const result = await service.fetchSingleList(definition);

      expect(result).toHaveLength(1);
      expect(statusService.updateListSyncStatus).toHaveBeenCalledWith(1);
    });
  });
});

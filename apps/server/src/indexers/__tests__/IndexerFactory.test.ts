import { describe, expect, it, vi } from "vitest";
import { createIndexerDefinition, type IndexerDefinition } from "../IndexerDefinition.js";
import { createIndexerStatus } from "../IndexerStatus.js";
import { IndexerFactory } from "../IndexerFactory.js";
import type { IIndexer } from "../IIndexer.js";
import type { IIndexerStatusService } from "../IndexerStatusService.js";

function fakeIndexer(definition: IndexerDefinition): IIndexer {
  return {
    name: definition.name,
    supportsRss: true,
    supportsSearch: true,
    protocol: 1,
    definition,
    fetchRecent: vi.fn(async () => []),
    fetch: vi.fn(async () => []),
    getDownloadRequest: vi.fn(),
    test: vi.fn(async () => ({ isValid: true, hasWarnings: false, errors: [] })),
    requestAction: vi.fn(),
  } as unknown as IIndexer;
}

function fakeIndexerStatusService(blocked: number[] = []): IIndexerStatusService {
  return {
    getBlockedProviders: vi.fn(() => blocked.map((id) => createIndexerStatus({ providerId: id }))),
    recordSuccess: vi.fn(),
    recordFailure: vi.fn(),
    recordConnectionFailure: vi.fn(),
    getLastRssSyncReleaseInfo: vi.fn(() => null),
    updateRssSyncStatus: vi.fn(),
  };
}

describe("IndexerFactory", () => {
  it("rssEnabled() returns only providers with a defined, enableRss=true definition", () => {
    const rssOn = fakeIndexer(createIndexerDefinition({ id: 1, name: "A", enableRss: true }));
    const rssOff = fakeIndexer(
      createIndexerDefinition({ id: 2, name: "B", enableRss: false, enableAutomaticSearch: true })
    );

    const factory = new IndexerFactory(fakeIndexerStatusService(), [rssOn, rssOff]);

    expect(factory.rssEnabled().map((i) => i.definition.id)).toEqual([1]);
  });

  it("automaticSearchEnabled()/interactiveSearchEnabled() filter on their own flags", () => {
    const auto = fakeIndexer(
      createIndexerDefinition({ id: 1, name: "A", enableAutomaticSearch: true })
    );
    const interactive = fakeIndexer(
      createIndexerDefinition({ id: 2, name: "B", enableInteractiveSearch: true })
    );

    const factory = new IndexerFactory(fakeIndexerStatusService(), [auto, interactive]);

    expect(factory.automaticSearchEnabled().map((i) => i.definition.id)).toEqual([1]);
    expect(factory.interactiveSearchEnabled().map((i) => i.definition.id)).toEqual([2]);
  });

  it("excludes an indexer entirely disabled (Enable == false, i.e. no flags set)", () => {
    const disabled = fakeIndexer(createIndexerDefinition({ id: 1, name: "Disabled" }));
    const factory = new IndexerFactory(fakeIndexerStatusService(), [disabled]);

    expect(factory.rssEnabled()).toEqual([]);
  });

  it("filters out blocked indexers by default", () => {
    const rssOn = fakeIndexer(createIndexerDefinition({ id: 1, name: "A", enableRss: true }));
    const factory = new IndexerFactory(fakeIndexerStatusService([1]), [rssOn]);

    expect(factory.rssEnabled()).toEqual([]);
    expect(factory.rssEnabled(false)).toEqual([rssOn]);
  });

  it("test() records success and returns the result when the indexer test passes", async () => {
    const definition = createIndexerDefinition({ id: 1, name: "A" });
    const indexer = fakeIndexer(definition);
    const statusService = fakeIndexerStatusService();
    const factory = new IndexerFactory(statusService, [indexer]);

    const result = await factory.test(definition);

    expect(result.isValid).toBe(true);
    expect(statusService.recordSuccess).toHaveBeenCalledWith(1);
  });

  it("test() records failure when the indexer test fails", async () => {
    const definition = createIndexerDefinition({ id: 1, name: "A" });
    const indexer = fakeIndexer(definition);
    (indexer.test as ReturnType<typeof vi.fn>).mockResolvedValue({
      isValid: false,
      hasWarnings: false,
      errors: [{ propertyName: "", errorMessage: "bad" }],
    });
    const statusService = fakeIndexerStatusService();
    const factory = new IndexerFactory(statusService, [indexer]);

    const result = await factory.test(definition);

    expect(result.isValid).toBe(false);
    expect(statusService.recordFailure).toHaveBeenCalledWith(1);
  });

  it("test() with id 0 (unsaved) does not record success/failure", async () => {
    const definition = createIndexerDefinition({ id: 0, name: "New" });
    const factory = new IndexerFactory(fakeIndexerStatusService(), []);

    const result = await factory.test(definition);

    expect(result.isValid).toBe(true);
  });
});

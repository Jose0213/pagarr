import { describe, expect, it } from "vitest";
import type { IIndexerFactory } from "../../../indexers/IndexerFactory.js";
import type { IIndexer } from "../../../indexers/IIndexer.js";
import { HealthCheckResult } from "../../healthCheck.js";
import { NullLocalizationService } from "../../localizationService.js";
import { IndexerSearchCheck } from "../indexerSearchCheck.js";

/** Translated from NzbDrone.Core.Test/HealthCheck/Checks/IndexerSearchCheckFixture.cs. */

function fakeIndexer(): IIndexer {
  return {
    name: "Indexer",
    supportsRss: false,
    supportsSearch: true,
    protocol: 0,
    definition: {} as never,
    fetchRecent: async () => [],
    fetch: async () => [],
    getDownloadRequest: () => {
      throw new Error("not used");
    },
    test: async () => ({ isValid: true, hasWarnings: false, errors: [] }),
    requestAction: () => null,
  };
}

interface FactoryOverrides {
  automaticUnfiltered?: IIndexer[];
  automaticFiltered?: IIndexer[];
  interactiveUnfiltered?: IIndexer[];
}

function factoryWith(overrides: FactoryOverrides = {}): IIndexerFactory {
  const automaticUnfiltered = overrides.automaticUnfiltered ?? [];
  const automaticFiltered = overrides.automaticFiltered ?? [];
  const interactiveUnfiltered = overrides.interactiveUnfiltered ?? [];

  return {
    rssEnabled: () => [],
    automaticSearchEnabled: (filterBlockedIndexers = true) =>
      filterBlockedIndexers ? automaticFiltered : automaticUnfiltered,
    interactiveSearchEnabled: () => interactiveUnfiltered,
    test: async () => ({ isValid: true, hasWarnings: false, errors: [] }),
  };
}

describe("IndexerSearchCheck", () => {
  it("should_return_warning_when_no_indexer_present", () => {
    const check = new IndexerSearchCheck(factoryWith(), new NullLocalizationService());

    expect(check.check().type).toBe(HealthCheckResult.Warning);
  });

  it("should_return_ok_when_automatic_and_interactive_search_is_enabled", () => {
    const indexer = fakeIndexer();
    const check = new IndexerSearchCheck(
      factoryWith({
        automaticUnfiltered: [indexer],
        automaticFiltered: [indexer],
        interactiveUnfiltered: [indexer],
      }),
      new NullLocalizationService()
    );

    expect(check.check().type).toBe(HealthCheckResult.Ok);
  });

  it("should_return_warning_when_only_automatic_search_is_enabled", () => {
    const indexer = fakeIndexer();
    const check = new IndexerSearchCheck(
      factoryWith({ automaticUnfiltered: [indexer], automaticFiltered: [indexer] }),
      new NullLocalizationService()
    );

    expect(check.check().type).toBe(HealthCheckResult.Warning);
  });

  it("should_return_warning_if_search_is_supported_but_disabled", () => {
    const check = new IndexerSearchCheck(factoryWith(), new NullLocalizationService());

    expect(check.check().type).toBe(HealthCheckResult.Warning);
  });

  it("should_return_filter_warning_if_search_is_enabled_but_filtered", () => {
    const indexer = fakeIndexer();
    const localizationService = { getLocalizedString: () => "recent indexer errors" };
    const check = new IndexerSearchCheck(
      factoryWith({
        automaticUnfiltered: [indexer],
        interactiveUnfiltered: [indexer],
      }),
      localizationService
    );

    const result = check.check();
    expect(result.type).toBe(HealthCheckResult.Warning);
    expect(result.message).toBe("recent indexer errors");
  });
});

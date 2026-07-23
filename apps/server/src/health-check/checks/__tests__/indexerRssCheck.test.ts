import { describe, expect, it } from "vitest";
import type { IIndexerFactory } from "../../../indexers/IndexerFactory.js";
import type { IIndexer } from "../../../indexers/IIndexer.js";
import { HealthCheckResult } from "../../healthCheck.js";
import { NullLocalizationService } from "../../localizationService.js";
import { IndexerRssCheck } from "../indexerRssCheck.js";

/** Translated from NzbDrone.Core.Test/HealthCheck/Checks/IndexerRssCheckFixture.cs. */

function fakeIndexer(): IIndexer {
  return {
    name: "Indexer",
    supportsRss: true,
    supportsSearch: false,
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

function factoryWith(
  rssEnabledUnfiltered: IIndexer[],
  rssEnabledFiltered: IIndexer[]
): IIndexerFactory {
  return {
    rssEnabled: (filterBlockedIndexers = true) =>
      filterBlockedIndexers ? rssEnabledFiltered : rssEnabledUnfiltered,
    automaticSearchEnabled: () => [],
    interactiveSearchEnabled: () => [],
    test: async () => ({ isValid: true, hasWarnings: false, errors: [] }),
  };
}

describe("IndexerRssCheck", () => {
  it("should_return_error_when_no_indexer_present", () => {
    const check = new IndexerRssCheck(factoryWith([], []), new NullLocalizationService());

    expect(check.check().type).toBe(HealthCheckResult.Error);
  });

  it("should_return_ok_when_rss_is_enabled", () => {
    const indexer = fakeIndexer();
    const check = new IndexerRssCheck(
      factoryWith([indexer], [indexer]),
      new NullLocalizationService()
    );

    expect(check.check().type).toBe(HealthCheckResult.Ok);
  });

  it("should_return_error_if_rss_is_supported_but_disabled", () => {
    // rssEnabled(false) has the indexer (RSS supported), but rssEnabled(true) is empty (filtered/disabled).
    const indexer = fakeIndexer();
    const check = new IndexerRssCheck(factoryWith([indexer], []), new NullLocalizationService());

    expect(check.check().type).toBe(HealthCheckResult.Warning);
  });

  it("should_return_filter_warning_if_rss_is_enabled_but_filtered", () => {
    const indexer = fakeIndexer();
    const localizationService = {
      getLocalizedString: () => "recent indexer errors",
    };
    const check = new IndexerRssCheck(factoryWith([indexer], []), localizationService);

    const result = check.check();
    expect(result.type).toBe(HealthCheckResult.Warning);
    expect(result.message).toBe("recent indexer errors");
  });
});

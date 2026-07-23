import { describe, expect, it } from "vitest";
import type { IIndexerRepository } from "../../../indexers/IndexerRepository.js";
import {
  createIndexerDefinition,
  type IndexerDefinition,
} from "../../../indexers/IndexerDefinition.js";
import { HealthCheckResult } from "../../healthCheck.js";
import { NullLocalizationService } from "../../localizationService.js";
import { IndexerJackettAllCheck, type TorznabSettingsLike } from "../indexerJackettAllCheck.js";

/** Translated from NzbDrone.Core.Test/HealthCheck/Checks/IndexerJackettAllCheckFixture.cs. */

function repositoryOf(indexers: IndexerDefinition[]): IIndexerRepository {
  return {
    all: () => indexers,
    find: () => undefined,
    get: () => {
      throw new Error("not used");
    },
    getMany: () => [],
    findByName: () => undefined,
    insert: (m) => m,
    update: (m) => m,
    upsert: (m) => m,
    delete: () => {},
    count: () => indexers.length,
  };
}

function givenIndexer(baseUrl: string, apiPath: string): IndexerDefinition {
  const settings: TorznabSettingsLike = { baseUrl, apiPath };
  return createIndexerDefinition({
    name: "Indexer",
    enableRss: true,
    configContract: "TorznabSettings",
    settings: settings as never,
  });
}

describe("IndexerJackettAllCheck", () => {
  it("should_not_return_error_when_no_indexers", () => {
    const check = new IndexerJackettAllCheck(repositoryOf([]), new NullLocalizationService());

    expect(check.check().type).toBe(HealthCheckResult.Ok);
  });

  it("should_not_return_error_when_no_jackett_all_indexers", () => {
    const indexer = givenIndexer("http://localhost:9117/", "api");
    const check = new IndexerJackettAllCheck(
      repositoryOf([indexer]),
      new NullLocalizationService()
    );

    expect(check.check().type).toBe(HealthCheckResult.Ok);
  });

  it.each([
    ["http://localhost:9117/torznab/all/api", "api"],
    ["http://localhost:9117/api/v2.0/indexers/all/results/torznab", "api"],
    ["http://localhost:9117/", "/torznab/all/api"],
    ["http://localhost:9117/", "/api/v2.0/indexers/all/results/torznab"],
  ])("should_return_warning_if_any_jackett_all_indexer_exists (%s, %s)", (baseUrl, apiPath) => {
    const indexer = givenIndexer(baseUrl, apiPath);
    const check = new IndexerJackettAllCheck(
      repositoryOf([indexer]),
      new NullLocalizationService()
    );

    expect(check.check().type).toBe(HealthCheckResult.Warning);
  });
});

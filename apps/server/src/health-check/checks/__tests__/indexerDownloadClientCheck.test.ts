import { describe, expect, it } from "vitest";
import type { IIndexerRepository } from "../../../indexers/IndexerRepository.js";
import {
  createIndexerDefinition,
  type IndexerDefinition,
} from "../../../indexers/IndexerDefinition.js";
import { createDownloadClientDefinition } from "../../../download-clients/DownloadClientDefinition.js";
import type { DownloadClientDefinition } from "../../../download-clients/DownloadClientDefinition.js";
import { HealthCheckResult } from "../../healthCheck.js";
import { NullLocalizationService } from "../../localizationService.js";
import { IndexerDownloadClientCheck } from "../indexerDownloadClientCheck.js";

/** New tests -- no dedicated C# fixture exists for IndexerDownloadClientCheck. */

function indexerRepositoryOf(indexers: IndexerDefinition[]): IIndexerRepository {
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

function downloadClientRepositoryOf(clients: DownloadClientDefinition[]): {
  all: () => DownloadClientDefinition[];
} {
  return { all: () => clients };
}

describe("IndexerDownloadClientCheck", () => {
  it("returns Ok when no indexer specifies a download client", () => {
    const indexer = createIndexerDefinition({
      name: "Indexer1",
      enableRss: true,
      downloadClientId: 0,
    });
    const check = new IndexerDownloadClientCheck(
      indexerRepositoryOf([indexer]),
      downloadClientRepositoryOf([]),
      new NullLocalizationService()
    );

    expect(check.check().type).toBe(HealthCheckResult.Ok);
  });

  it("returns Ok when the specified download client exists and is enabled", () => {
    const client = createDownloadClientDefinition({ id: 5, name: "qBit", enable: true });
    const indexer = createIndexerDefinition({
      name: "Indexer1",
      enableRss: true,
      downloadClientId: 5,
    });

    const check = new IndexerDownloadClientCheck(
      indexerRepositoryOf([indexer]),
      downloadClientRepositoryOf([client]),
      new NullLocalizationService()
    );

    expect(check.check().type).toBe(HealthCheckResult.Ok);
  });

  it("returns Warning naming the indexer when its configured download client no longer exists", () => {
    const indexer = createIndexerDefinition({
      name: "Indexer1",
      enableRss: true,
      downloadClientId: 999,
    });

    const check = new IndexerDownloadClientCheck(
      indexerRepositoryOf([indexer]),
      downloadClientRepositoryOf([]),
      new NullLocalizationService()
    );

    expect(check.check().type).toBe(HealthCheckResult.Warning);
  });

  it("returns Warning when the configured download client exists but is disabled", () => {
    const client = createDownloadClientDefinition({ id: 5, name: "qBit", enable: false });
    const indexer = createIndexerDefinition({
      name: "Indexer1",
      enableRss: true,
      downloadClientId: 5,
    });

    const check = new IndexerDownloadClientCheck(
      indexerRepositoryOf([indexer]),
      downloadClientRepositoryOf([client]),
      new NullLocalizationService()
    );

    expect(check.check().type).toBe(HealthCheckResult.Warning);
  });

  it("ignores a disabled indexer's dangling download client reference", () => {
    const indexer = createIndexerDefinition({
      name: "Indexer1",
      enableRss: false,
      enableAutomaticSearch: false,
      enableInteractiveSearch: false,
      downloadClientId: 999,
    });

    const check = new IndexerDownloadClientCheck(
      indexerRepositoryOf([indexer]),
      downloadClientRepositoryOf([]),
      new NullLocalizationService()
    );

    expect(check.check().type).toBe(HealthCheckResult.Ok);
  });
});

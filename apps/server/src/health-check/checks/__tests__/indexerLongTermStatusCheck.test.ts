import { describe, expect, it } from "vitest";
import { IndexerFactory } from "../../../indexers/IndexerFactory.js";
import type { IIndexer } from "../../../indexers/IIndexer.js";
import { createIndexerDefinition } from "../../../indexers/IndexerDefinition.js";
import { createIndexerStatus, type IndexerStatus } from "../../../indexers/IndexerStatus.js";
import type { IIndexerStatusService } from "../../../indexers/IndexerStatusService.js";
import { HealthCheckResult } from "../../healthCheck.js";
import { NullLocalizationService } from "../../localizationService.js";
import { IndexerLongTermStatusCheck } from "../indexerLongTermStatusCheck.js";

/** Translated from NzbDrone.Core.Test/HealthCheck/Checks/IndexerLongTermStatusCheckFixture.cs. */

function fakeIndexer(id: number): IIndexer {
  return {
    name: `Indexer${id}`,
    supportsRss: true,
    supportsSearch: true,
    protocol: 0,
    definition: createIndexerDefinition({
      id,
      enableRss: true,
      enableAutomaticSearch: true,
      enableInteractiveSearch: true,
    }),
    fetchRecent: async () => [],
    fetch: async () => [],
    getDownloadRequest: () => {
      throw new Error("not used");
    },
    test: async () => ({ isValid: true, hasWarnings: false, errors: [] }),
    requestAction: () => null,
  };
}

function statusServiceReturning(blocked: IndexerStatus[]): IIndexerStatusService {
  return {
    getBlockedProviders: () => blocked,
    recordSuccess: () => {},
    recordFailure: () => {},
    recordConnectionFailure: () => {},
    getLastRssSyncReleaseInfo: () => null,
    updateRssSyncStatus: () => {},
  };
}

function givenIndexer(
  indexers: IIndexer[],
  blocked: IndexerStatus[],
  id: number,
  backoffHours: number,
  failureHours: number
): void {
  indexers.push(fakeIndexer(id));

  if (backoffHours !== 0) {
    const now = Date.now();
    blocked.push(
      createIndexerStatus({
        providerId: id,
        initialFailure: new Date(now - failureHours * 60 * 60 * 1000).toISOString(),
        mostRecentFailure: new Date(now - 0.1 * 60 * 60 * 1000).toISOString(),
        escalationLevel: 5,
        disabledTill: new Date(now + backoffHours * 60 * 60 * 1000).toISOString(),
      })
    );
  }
}

describe("IndexerLongTermStatusCheck", () => {
  it("should_not_return_error_when_no_indexers", () => {
    const factory = new IndexerFactory(statusServiceReturning([]), []);
    const check = new IndexerLongTermStatusCheck(
      factory,
      statusServiceReturning([]),
      new NullLocalizationService()
    );

    expect(check.check().type).toBe(HealthCheckResult.Ok);
  });

  it("should_return_warning_if_indexer_unavailable", () => {
    const indexers: IIndexer[] = [];
    const blocked: IndexerStatus[] = [];
    // 24h-old failure -- past the 6-hour "long term" threshold.
    givenIndexer(indexers, blocked, 1, 10.0, 24.0);
    givenIndexer(indexers, blocked, 2, 0.0, 0.0);

    const statusService = statusServiceReturning(blocked);
    const factory = new IndexerFactory(statusService, indexers);
    const check = new IndexerLongTermStatusCheck(
      factory,
      statusService,
      new NullLocalizationService()
    );

    expect(check.check().type).toBe(HealthCheckResult.Warning);
  });

  it("should_return_error_if_all_indexers_unavailable", () => {
    const indexers: IIndexer[] = [];
    const blocked: IndexerStatus[] = [];
    givenIndexer(indexers, blocked, 1, 10.0, 24.0);

    const statusService = statusServiceReturning(blocked);
    const factory = new IndexerFactory(statusService, indexers);
    const check = new IndexerLongTermStatusCheck(
      factory,
      statusService,
      new NullLocalizationService()
    );

    expect(check.check().type).toBe(HealthCheckResult.Error);
  });

  it("should_return_warning_if_few_indexers_unavailable", () => {
    const indexers: IIndexer[] = [];
    const blocked: IndexerStatus[] = [];
    givenIndexer(indexers, blocked, 1, 10.0, 24.0);
    givenIndexer(indexers, blocked, 2, 10.0, 24.0);
    givenIndexer(indexers, blocked, 3, 0.0, 0.0);

    const statusService = statusServiceReturning(blocked);
    const factory = new IndexerFactory(statusService, indexers);
    const check = new IndexerLongTermStatusCheck(
      factory,
      statusService,
      new NullLocalizationService()
    );

    expect(check.check().type).toBe(HealthCheckResult.Warning);
  });

  it("does NOT flag a failure inside the 6-hour window (IndexerStatusCheck's job, not LongTerm's)", () => {
    const indexers: IIndexer[] = [];
    const blocked: IndexerStatus[] = [];
    givenIndexer(indexers, blocked, 1, 2.0, 4.0);

    const statusService = statusServiceReturning(blocked);
    const factory = new IndexerFactory(statusService, indexers);
    const check = new IndexerLongTermStatusCheck(
      factory,
      statusService,
      new NullLocalizationService()
    );

    expect(check.check().type).toBe(HealthCheckResult.Ok);
  });
});

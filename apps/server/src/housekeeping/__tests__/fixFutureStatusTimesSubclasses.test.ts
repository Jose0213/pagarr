import { describe, expect, it, afterEach, beforeEach } from "vitest";
import { createTestDatabase } from "./testDb.js";
import type { MainDatabase } from "../../db/db-factory.js";
import { IndexerStatusRepository } from "../../indexers/IndexerStatusRepository.js";
import { DownloadClientStatusRepository } from "../../download-clients/DownloadClientStatusRepository.js";
import { FixFutureIndexerStatusTimes } from "../housekeepers/fixFutureIndexerStatusTimes.js";
import { FixFutureDownloadClientStatusTimes } from "../housekeepers/fixFutureDownloadClientStatusTimes.js";
import { FixFutureImportListStatusTimes } from "../housekeepers/fixFutureImportListStatusTimes.js";
import { FixFutureNotificationStatusTimes } from "../housekeepers/fixFutureNotificationStatusTimes.js";
import {
  ImportListStatusRepositoryForCleanup,
  NotificationStatusRepositoryForCleanup,
} from "../providerStatusRepositories.js";

/**
 * Wiring tests for the four concrete `FixFuture*StatusTimes` subclasses --
 * confirms each correctly plugs its real (or forward-ref) provider-status
 * repository into the shared `FixFutureProviderStatusTimes<TModel>` base.
 */
describe("FixFuture*StatusTimes concrete subclasses", () => {
  let db: MainDatabase;

  beforeEach(() => {
    db = createTestDatabase();
  });

  afterEach(() => {
    db.close();
  });

  const farFuture = () => new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();

  it("FixFutureIndexerStatusTimes clamps a future IndexerStatus.DisabledTill via the real IndexerStatusRepository", () => {
    const repo = new IndexerStatusRepository(db);
    const inserted = repo.upsert({
      id: 0,
      providerId: 1,
      initialFailure: null,
      mostRecentFailure: null,
      escalationLevel: 1,
      disabledTill: farFuture(),
      lastRssSyncReleaseInfo: null,
    });

    new FixFutureIndexerStatusTimes(repo).clean();

    const after = repo.find(inserted.id)!;
    expect(new Date(after.disabledTill!).getTime()).toBeLessThan(new Date(farFuture()).getTime());
  });

  it("FixFutureDownloadClientStatusTimes clamps a future DownloadClientStatus.DisabledTill via the real DownloadClientStatusRepository", () => {
    const repo = new DownloadClientStatusRepository(db);
    const inserted = repo.upsert({
      id: 0,
      providerId: 1,
      initialFailure: null,
      mostRecentFailure: null,
      escalationLevel: 1,
      disabledTill: farFuture(),
    });

    new FixFutureDownloadClientStatusTimes(repo).clean();

    const after = repo.find(inserted.id)!;
    expect(new Date(after.disabledTill!).getTime()).toBeLessThan(new Date(farFuture()).getTime());
  });

  it("FixFutureImportListStatusTimes clamps a future ImportListStatus.DisabledTill via the forward-ref repository against the real table", () => {
    const repo = new ImportListStatusRepositoryForCleanup(db);
    const inserted = repo.upsert({
      id: 0,
      providerId: 1,
      initialFailure: null,
      mostRecentFailure: null,
      escalationLevel: 1,
      disabledTill: farFuture(),
    });

    new FixFutureImportListStatusTimes(repo).clean();

    const after = repo.findByProviderId(1)!;
    expect(after.id).toBe(inserted.id);
    expect(new Date(after.disabledTill!).getTime()).toBeLessThan(new Date(farFuture()).getTime());
  });

  it("FixFutureNotificationStatusTimes clamps a future NotificationStatus.DisabledTill via the forward-ref repository against the real table", () => {
    const repo = new NotificationStatusRepositoryForCleanup(db);
    const inserted = repo.upsert({
      id: 0,
      providerId: 1,
      initialFailure: null,
      mostRecentFailure: null,
      escalationLevel: 1,
      disabledTill: farFuture(),
    });

    new FixFutureNotificationStatusTimes(repo).clean();

    const after = repo.findByProviderId(1)!;
    expect(after.id).toBe(inserted.id);
    expect(new Date(after.disabledTill!).getTime()).toBeLessThan(new Date(farFuture()).getTime());
  });
});

import { describe, expect, it, afterEach, beforeEach } from "vitest";
import { createTestDatabase } from "./testDb.js";
import type { MainDatabase } from "../../db/db-factory.js";
import {
  ImportListStatusRepositoryForCleanup,
  NotificationStatusRepositoryForCleanup,
} from "../providerStatusRepositories.js";

/**
 * Forward-ref repositories for the not-yet-ported ImportLists/Notifications
 * modules -- see providerStatusRepositories.ts's doc comment. These tests
 * confirm both satisfy the real `IProviderStatusRepositoryLike<ProviderStatusBase>`
 * contract against the real "ImportListStatus"/"NotificationStatus" tables.
 */
describe.each([
  ["ImportListStatusRepositoryForCleanup", ImportListStatusRepositoryForCleanup] as const,
  ["NotificationStatusRepositoryForCleanup", NotificationStatusRepositoryForCleanup] as const,
])("%s", (_name, RepoClass) => {
  let db: MainDatabase;

  beforeEach(() => {
    db = createTestDatabase();
  });

  afterEach(() => {
    db.close();
  });

  it("upsert() inserts a new row when id is 0, then updates it on a second call", () => {
    const repo = new RepoClass(db);

    const inserted = repo.upsert({
      id: 0,
      providerId: 5,
      initialFailure: null,
      mostRecentFailure: null,
      escalationLevel: 1,
      disabledTill: null,
    });
    expect(inserted.id).toBeGreaterThan(0);

    const updated = repo.upsert({ ...inserted, escalationLevel: 2 });
    expect(updated.id).toBe(inserted.id);

    const found = repo.findByProviderId(5);
    expect(found?.escalationLevel).toBe(2);
    expect(repo.all()).toHaveLength(1);
  });

  it("findByProviderId returns undefined when no row matches", () => {
    const repo = new RepoClass(db);
    expect(repo.findByProviderId(999)).toBeUndefined();
  });

  it("deleteByProviderId removes the matching row", () => {
    const repo = new RepoClass(db);
    repo.upsert({
      id: 0,
      providerId: 9,
      initialFailure: null,
      mostRecentFailure: null,
      escalationLevel: 0,
      disabledTill: null,
    });

    repo.deleteByProviderId(9);

    expect(repo.findByProviderId(9)).toBeUndefined();
    expect(repo.all()).toHaveLength(0);
  });
});

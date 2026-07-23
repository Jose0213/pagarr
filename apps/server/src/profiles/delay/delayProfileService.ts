import type { DelayProfile } from "./delayProfile.js";
import type { DelayProfileRepository } from "./delayProfileRepository.js";

/**
 * Ported from NzbDrone.Core/Profiles/Delay/DelayProfileService.cs.
 *
 * DEVIATION: C#'s `ICacheManager.GetCache<DelayProfile>(GetType(), "best")`
 * (NzbDrone.Common.Cache, not yet ported -- a generic process-wide
 * TTL-keyed cache) is replaced by a small private Map-based TTL cache
 * scoped to this service instance, preserving the same externally-visible
 * behavior BestForTags() depends on: a 30-second-TTL memoized lookup keyed
 * by the sorted/joined tag-id string, cleared on Add/Update/Delete. Once
 * the Cache module is ported, this private cache can be swapped for
 * `ICacheManager.GetCache<DelayProfile>` without changing any public
 * method here.
 */
class TtlCache<T> {
  private readonly entries = new Map<string, { value: T; expiresAt: number }>();

  constructor(private readonly ttlMs: number) {}

  get(key: string, factory: () => T): T {
    const now = Date.now();
    const existing = this.entries.get(key);
    if (existing && existing.expiresAt > now) {
      return existing.value;
    }

    const value = factory();
    this.entries.set(key, { value, expiresAt: now + this.ttlMs });
    return value;
  }

  clear(): void {
    this.entries.clear();
  }
}

export class DelayProfileService {
  private readonly bestForTagsCache = new TtlCache<DelayProfile>(30_000);

  constructor(private readonly repo: DelayProfileRepository) {}

  /** Ported from DelayProfileService.Add(): new profiles are appended (Order = current count). */
  add(profile: DelayProfile): DelayProfile {
    const withOrder = { ...profile, order: this.repo.count() };
    const result = this.repo.insert(withOrder);
    this.bestForTagsCache.clear();
    return result;
  }

  update(profile: DelayProfile): DelayProfile {
    const result = this.repo.update(profile);
    this.bestForTagsCache.clear();
    return result;
  }

  /**
   * Ported from DelayProfileService.Delete(): deletes, then renumbers every
   * remaining profile's Order to its position in Order-sorted sequence,
   * skipping the fixed default profile (Id == 1, seeded by migration
   * 0001_initial_setup.sql and never renumbered/deleted itself).
   */
  delete(id: number): void {
    this.repo.delete(id);

    const all = this.all().sort((a, b) => a.order - b.order);

    for (let i = 0; i < all.length; i++) {
      const profile = all[i];
      if (!profile || profile.id === 1) {
        continue;
      }
      profile.order = i + 1;
    }

    this.repo.updateMany(all);
    this.bestForTagsCache.clear();
  }

  all(): DelayProfile[] {
    return this.repo.all();
  }

  get(id: number): DelayProfile {
    return this.repo.get(id);
  }

  allForTag(tagId: number): DelayProfile[] {
    return this.all().filter((r) => r.tags.has(tagId));
  }

  /** Ported from DelayProfileService.AllForTags(): matches any profile sharing a tag, OR any untagged (global) profile. */
  allForTags(tagIds: Set<number>): DelayProfile[] {
    return this.all().filter((r) => intersects(r.tags, tagIds) || r.tags.size === 0);
  }

  /**
   * Ported from DelayProfileService.BestForTags(): the lowest-Order profile
   * among AllForTags' matches, 30s-cached per distinct tag-id-set key
   * (matches the C# cache key format: "-" + join(",", tagIds)).
   */
  bestForTags(tagIds: Set<number>): DelayProfile {
    const key = "-" + Array.from(tagIds).join(",");
    return this.bestForTagsCache.get(key, () => this.fetchBestForTags(tagIds));
  }

  private fetchBestForTags(tagIds: Set<number>): DelayProfile {
    const matches = this.repo
      .all()
      .filter((r) => intersects(r.tags, tagIds) || r.tags.size === 0)
      .sort((a, b) => a.order - b.order);

    const best = matches[0];
    if (!best) {
      throw new Error("Sequence contains no elements");
    }
    return best;
  }

  /**
   * Ported from DelayProfileService.Reorder(int id, int? afterId): moves
   * `id` to immediately after `afterId` (or to the front if `afterId` is
   * null/undefined) in Order-sorted sequence, renumbering every other
   * profile's Order to keep the sequence contiguous. Id == 1 (the fixed
   * default profile) is never renumbered, matching the C# source's
   * `if (delayProfile.Id == 1) continue;` guard in the same loop.
   */
  reorder(id: number, afterId: number | null): DelayProfile[] {
    const all = this.all().sort((a, b) => a.order - b.order);

    const moving = all.find((d) => d.id === id);
    const after = afterId != null ? all.find((d) => d.id === afterId) : undefined;

    if (!moving) {
      // TODO: This should throw (ported verbatim from the C# source's own TODO).
      return all;
    }

    const afterOrder = getAfterOrder(moving, after ?? null);
    let afterCount = afterOrder + 2;
    const movingOrder = moving.order;

    for (const delayProfile of all) {
      if (delayProfile.id === 1) {
        continue;
      }

      if (delayProfile.id === id) {
        delayProfile.order = afterOrder + 1;
      } else if (after !== undefined && delayProfile.id === after.id) {
        delayProfile.order = afterOrder;
      } else if (delayProfile.order > afterOrder) {
        delayProfile.order = afterCount;
        afterCount++;
      } else if (delayProfile.order > movingOrder) {
        delayProfile.order--;
      }
    }

    this.repo.updateMany(all);

    return this.all();
  }
}

function intersects(a: Set<number>, b: Set<number>): boolean {
  for (const value of a) {
    if (b.has(value)) {
      return true;
    }
  }
  return false;
}

function getAfterOrder(moving: DelayProfile, after: DelayProfile | null): number {
  if (after === null) {
    return 0;
  }

  if (moving.order < after.order) {
    return after.order - 1;
  }

  return after.order;
}

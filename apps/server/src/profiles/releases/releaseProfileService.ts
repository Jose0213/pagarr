import type { ReleaseProfile } from "./releaseProfile.js";
import type { ReleaseProfileRepository } from "./releaseProfileRepository.js";

/**
 * Ported from NzbDrone.Core/Profiles/Releases/ReleaseProfileService.cs.
 * NLog `_logger` dropped (see qualityProfileService.ts's identical note --
 * Instrumentation isn't ported yet and nothing here needs logging to behave
 * correctly).
 */
export class ReleaseProfileService {
  constructor(private readonly repo: ReleaseProfileRepository) {}

  all(): ReleaseProfile[] {
    return this.repo.all();
  }

  allForTag(tagId: number): ReleaseProfile[] {
    return this.repo.all().filter((r) => r.tags.has(tagId));
  }

  allForTags(tagIds: Set<number>): ReleaseProfile[] {
    return this.repo.all().filter((r) => intersects(r.tags, tagIds) || r.tags.size === 0);
  }

  /** Ported from ReleaseProfileService.EnabledForTags(): AllForTags, further filtered to Enabled profiles global or scoped to this indexer. */
  enabledForTags(tagIds: Set<number>, indexerId: number): ReleaseProfile[] {
    return this.allForTags(tagIds).filter(
      (r) => r.enabled && (r.indexerId === indexerId || r.indexerId === 0)
    );
  }

  get(id: number): ReleaseProfile {
    return this.repo.get(id);
  }

  delete(id: number): void {
    this.repo.delete(id);
  }

  add(restriction: ReleaseProfile): ReleaseProfile {
    return this.repo.insert(restriction);
  }

  update(restriction: ReleaseProfile): ReleaseProfile {
    return this.repo.update(restriction);
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

import { describe, expect, it, vi } from "vitest";
import { newReleaseProfile } from "../releases/releaseProfile.js";
import { ReleaseProfileService } from "../releases/releaseProfileService.js";
import type { ReleaseProfileRepository } from "../releases/releaseProfileRepository.js";

/** Ported behavior from NzbDrone.Core/Profiles/Releases/ReleaseProfileService.cs (no C# unit test exists to translate). */
describe("ReleaseProfileService", () => {
  function makeService(all: ReturnType<typeof newReleaseProfile>[]): ReleaseProfileService {
    const repo = {
      all: vi.fn(() => all),
      get: vi.fn((id: number) => all.find((r) => r.id === id)),
      delete: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
    } as unknown as ReleaseProfileRepository;
    return new ReleaseProfileService(repo);
  }

  it("allForTag returns profiles containing the given tag", () => {
    const a = newReleaseProfile({ id: 1, tags: new Set([5]) });
    const b = newReleaseProfile({ id: 2, tags: new Set([9]) });
    const service = makeService([a, b]);

    expect(service.allForTag(5).map((r) => r.id)).toEqual([1]);
  });

  it("allForTags matches shared tags OR untagged (global) profiles", () => {
    const tagged = newReleaseProfile({ id: 1, tags: new Set([5]) });
    const untagged = newReleaseProfile({ id: 2, tags: new Set() });
    const unrelated = newReleaseProfile({ id: 3, tags: new Set([99]) });
    const service = makeService([tagged, untagged, unrelated]);

    expect(
      service
        .allForTags(new Set([5]))
        .map((r) => r.id)
        .sort()
    ).toEqual([1, 2]);
  });

  it("enabledForTags further filters to Enabled profiles scoped to this indexer or global (IndexerId 0)", () => {
    const globalEnabled = newReleaseProfile({ id: 1, enabled: true, indexerId: 0 });
    const scopedEnabled = newReleaseProfile({ id: 2, enabled: true, indexerId: 7 });
    const scopedOtherIndexer = newReleaseProfile({ id: 3, enabled: true, indexerId: 8 });
    const disabled = newReleaseProfile({ id: 4, enabled: false, indexerId: 0 });

    const service = makeService([globalEnabled, scopedEnabled, scopedOtherIndexer, disabled]);

    const result = service
      .enabledForTags(new Set(), 7)
      .map((r) => r.id)
      .sort();
    expect(result).toEqual([1, 2]);
  });
});

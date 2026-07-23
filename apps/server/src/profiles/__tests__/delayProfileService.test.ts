import { beforeEach, describe, expect, it, vi } from "vitest";
import { newDelayProfile, type DelayProfile } from "../delay/delayProfile.js";
import { DelayProfileService } from "../delay/delayProfileService.js";
import type { DelayProfileRepository } from "../delay/delayProfileRepository.js";

function makeRepo(all: DelayProfile[]): DelayProfileRepository {
  return {
    all: vi.fn(() => all),
    get: vi.fn((id: number) => all.find((d) => d.id === id)),
    find: vi.fn(),
    insert: vi.fn(),
    update: vi.fn((p: DelayProfile) => p),
    updateMany: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(() => all.length),
  } as unknown as DelayProfileRepository;
}

/** Ported from NzbDrone.Core.Test/Profiles/Delay/DelayProfileServiceFixture.cs. */
describe("DelayProfileService.reorder", () => {
  let delayProfiles: DelayProfile[];
  let first: DelayProfile;
  let last: DelayProfile;
  let service: DelayProfileService;

  beforeEach(() => {
    delayProfiles = [
      newDelayProfile({ id: 1, order: Number.MAX_SAFE_INTEGER }),
      newDelayProfile({ id: 2, order: 1 }),
      newDelayProfile({ id: 3, order: 2 }),
      newDelayProfile({ id: 4, order: 3 }),
    ];

    first = delayProfiles[1]!;
    last = delayProfiles[delayProfiles.length - 1]!;

    service = new DelayProfileService(makeRepo(delayProfiles));
  });

  it("should_move_to_first_if_afterId_is_null", () => {
    const result = service.reorder(last.id, null).sort((a, b) => a.order - b.order);
    const moved = result[0]!;

    expect(moved.id).toBe(last.id);
    expect(moved.order).toBe(1);
  });

  it("should_move_after_if_afterId_is_not_null", () => {
    const after = first;
    const result = service.reorder(last.id, first.id).sort((a, b) => a.order - b.order);
    const moved = result[1]!;

    expect(moved.id).toBe(last.id);
    expect(moved.order).toBe(after.order + 1);
  });

  it("should_reorder_delay_profiles_that_are_after_moved", () => {
    const result = service.reorder(last.id, null).sort((a, b) => a.order - b.order);

    for (let i = 1; i < result.length; i++) {
      const delayProfile = result[i]!;
      if (delayProfile.id === 1) {
        expect(delayProfile.order).toBe(Number.MAX_SAFE_INTEGER);
      } else {
        expect(delayProfile.order).toBe(i + 1);
      }
    }
  });

  it("should_not_change_afters_order_if_moving_was_after", () => {
    const after = first;
    const afterOrder = after.order;
    const result = service.reorder(last.id, first.id).sort((a, b) => a.order - b.order);
    const afterMove = result[0]!;

    expect(afterMove.id).toBe(after.id);
    expect(afterMove.order).toBe(afterOrder);
  });

  it("should_change_afters_order_if_moving_was_before", () => {
    const after = last;
    const afterOrder = after.order;
    const moving = first;

    const result = service.reorder(moving.id, after.id);
    const afterMove = result.find((d) => d.id === after.id)!;

    expect(afterMove.order).toBeLessThan(afterOrder);
  });
});

describe("DelayProfileService", () => {
  it("add() sets Order to the current repository count, matching Add()'s Order = _repo.Count()", () => {
    const repo = makeRepo([newDelayProfile({ id: 1 })]);
    (repo.insert as ReturnType<typeof vi.fn>).mockImplementation((p: DelayProfile) => ({
      ...p,
      id: 2,
    }));

    const service = new DelayProfileService(repo);
    const created = service.add(newDelayProfile());

    expect(repo.insert).toHaveBeenCalledWith(expect.objectContaining({ order: 1 }));
    expect(created.id).toBe(2);
  });

  it("delete() renumbers remaining profiles by Order, skipping Id 1", () => {
    const remaining = [
      newDelayProfile({ id: 1, order: Number.MAX_SAFE_INTEGER }),
      newDelayProfile({ id: 2, order: 1 }),
      newDelayProfile({ id: 3, order: 2 }),
    ];
    const repo = makeRepo(remaining);
    const service = new DelayProfileService(repo);

    service.delete(4);

    expect(repo.delete).toHaveBeenCalledWith(4);
    // delete() sorts remaining profiles ascending by Order before
    // renumbering, so id 1 (Order = MAX) sorts last -- id 1 itself is never
    // renumbered (the C# source's `if (delayProfile.Id == 1) continue;`
    // guard), while ids 2 and 3 get their Order reassigned to their
    // 1-based position in that sorted sequence.
    expect(repo.updateMany).toHaveBeenCalledWith([
      expect.objectContaining({ id: 2, order: 1 }),
      expect.objectContaining({ id: 3, order: 2 }),
      expect.objectContaining({ id: 1, order: Number.MAX_SAFE_INTEGER }),
    ]);
  });

  describe("allForTags/bestForTags", () => {
    it("allForTags matches profiles sharing a tag or having no tags at all", () => {
      const tagged = newDelayProfile({ id: 1, tags: new Set([5]) });
      const untagged = newDelayProfile({ id: 2, tags: new Set() });
      const unrelated = newDelayProfile({ id: 3, tags: new Set([99]) });

      const service = new DelayProfileService(makeRepo([tagged, untagged, unrelated]));

      const result = service.allForTags(new Set([5])).map((d) => d.id);
      expect(result.sort()).toEqual([1, 2]);
    });

    it("bestForTags returns the lowest-Order match among AllForTags", () => {
      const low = newDelayProfile({ id: 1, order: 5, tags: new Set([1]) });
      const lower = newDelayProfile({ id: 2, order: 1, tags: new Set([1]) });

      const service = new DelayProfileService(makeRepo([low, lower]));

      expect(service.bestForTags(new Set([1])).id).toBe(2);
    });
  });
});

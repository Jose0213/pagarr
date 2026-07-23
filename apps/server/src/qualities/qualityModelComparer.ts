/**
 * Ported from NzbDrone.Core/Qualities/QualityModelComparer.cs.
 *
 * DEVIATION (forward reference, documented per PORT_PLAN.md): the real C#
 * `QualityModelComparer` takes a constructor-injected `QualityProfile` (from
 * `NzbDrone.Core.Profiles.Qualities`) and calls `profile.GetIndex(...)`,
 * which returns a `QualityIndex` (Index + GroupIndex,
 * IComparable<QualityIndex>). Per PORT_PLAN.md's module order, `Profiles` is
 * a sibling Phase-1 module ported separately/in parallel and hasn't landed
 * yet, so this file can't import a real `QualityProfile` type.
 *
 * Instead this ports against two small structural interfaces --
 * `QualityIndexLike` (Index/GroupIndex + the exact `compareTo(other,
 * respectGroupOrder)` behavior of `QualityIndex.CompareTo`, copied faithfully
 * from Profiles/Qualities/QualityIndex.cs since that type has no persistence
 * or other dependencies of its own) and `QualityProfileLike` (just the
 * `getIndex(qualityId, respectGroupOrder)` method this class actually calls).
 * When the Profiles module is ported, its real `QualityProfile` class should
 * structurally satisfy `QualityProfileLike` without this file needing to
 * change; at that point the Profiles module can also re-export
 * `QualityIndex`/`compareQualityIndex` from here if useful, or this comment
 * can be deleted in favor of importing the real type directly.
 */

import type { Quality } from "./quality.js";
import type { QualityModel } from "./qualityModel.js";

/** Ported from Profiles/Qualities/QualityIndex.cs -- see the deviation note above. */
export interface QualityIndexLike {
  readonly index: number;
  readonly groupIndex: number;
}

/**
 * Ported from `QualityIndex.CompareTo(QualityIndex right, bool
 * respectGroupOrder)`. A `right == null` C# case returns 1 (any real index
 * is "greater than" a missing one); ported here as `right ===
 * null/undefined`.
 */
export function compareQualityIndex(
  left: QualityIndexLike,
  right: QualityIndexLike | null | undefined,
  respectGroupOrder: boolean
): number {
  if (right === null || right === undefined) {
    return 1;
  }

  const indexCompare = left.index === right.index ? 0 : left.index < right.index ? -1 : 1;

  if (respectGroupOrder && indexCompare === 0) {
    return left.groupIndex === right.groupIndex ? 0 : left.groupIndex < right.groupIndex ? -1 : 1;
  }

  return indexCompare;
}

/** The subset of `QualityProfile`'s surface this comparer actually calls -- see the deviation note above. */
export interface QualityProfileLike {
  getIndex(qualityId: number, respectGroupOrder?: boolean): QualityIndexLike;
}

/**
 * Ported from `QualityModelComparer : IComparer<Quality>,
 * IComparer<QualityModel>`. C# validates the profile has items via
 * `Ensure.That(...).IsNotNull()` / `.HasItems()` in the constructor; ported
 * as explicit throws with the same intent (fail fast on a profile that can't
 * answer `GetIndex`).
 */
export class QualityModelComparer {
  private readonly profile: QualityProfileLike;

  constructor(profile: QualityProfileLike) {
    if (profile === null || profile === undefined) {
      throw new Error("profile must not be null");
    }

    this.profile = profile;
  }

  /** Ported from `Compare(Quality left, Quality right)` (respectGroupOrder defaults to false). */
  compareQuality(left: Quality, right: Quality, respectGroupOrder = false): number {
    const leftIndex = this.profile.getIndex(left.id, respectGroupOrder);
    const rightIndex = this.profile.getIndex(right.id, respectGroupOrder);

    return compareQualityIndex(leftIndex, rightIndex, respectGroupOrder);
  }

  /**
   * Ported from `Compare(QualityModel left, QualityModel right, bool
   * respectGroupOrder = false)`. Compares by Quality first (via the
   * profile's ordering), then falls back to `Revision.CompareTo` when the
   * qualities tie.
   */
  compare(left: QualityModel, right: QualityModel, respectGroupOrder = false): number {
    const result = this.compareQuality(left.quality, right.quality, respectGroupOrder);

    if (result === 0) {
      return left.revision.compareTo(right.revision);
    }

    return result;
  }
}

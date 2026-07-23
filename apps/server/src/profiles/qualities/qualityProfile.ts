import type { ModelBase } from "../../db/model-base.js";
import type { Quality } from "../../qualities/quality.js";
import type { CustomFormat } from "../customFormat.js";
import type { ProfileFormatItem } from "../profileFormatItem.js";
import { QualityIndex } from "./qualityIndex.js";
import type { QualityProfileQualityItem } from "./qualityProfileQualityItem.js";

/**
 * Ported from NzbDrone.Core/Profiles/Qualities/QualityProfile.cs.
 *
 * `Items`/`FormatItems` are stored as JSON in the "QualityProfiles" table's
 * "Items"/"FormatItems" columns (see qualityProfileRepository.ts) and
 * rehydrated as plain arrays here -- no ORM/reflection equivalent needed
 * since this is a plain data interface, not a class with behavior baked
 * into instances. The instance methods from the C# class (FirstAllowedQuality,
 * LastAllowedQuality, GetIndex, CalculateCustomFormatScore) are ported as
 * free functions taking a QualityProfile, matching this port's general
 * "plain data + free functions" style (see PORT_PLAN.md) rather than
 * reintroducing a class hierarchy.
 *
 * RECONCILIATION (Phase 1 merge, see PORT_PLAN.md): the sibling Qualities
 * module's `QualityModelComparer` (ported from
 * NzbDrone.Core/Qualities/QualityModelComparer.cs) takes a constructor-
 * injected `QualityProfile` and calls `profile.GetIndex(...)` as an instance
 * method -- the real C# `QualityProfile` has both the free-standing behavior
 * ported here AND is the thing implementing that call. Since this port
 * deliberately uses free functions instead of methods, `asQualityProfileLike`
 * below adapts a `QualityProfile` to the `QualityProfileLike` structural
 * interface `QualityModelComparer` expects, without adding a class wrapper
 * or reintroducing methods-on-data here.
 */
export interface QualityProfile extends ModelBase {
  name: string;
  upgradeAllowed: boolean;
  cutoff: number;
  minFormatScore: number;
  cutoffFormatScore: number;
  formatItems: ProfileFormatItem[];
  items: QualityProfileQualityItem[];
}

export function newQualityProfile(overrides: Partial<QualityProfile> = {}): QualityProfile {
  return {
    id: 0,
    name: "",
    upgradeAllowed: false,
    cutoff: 0,
    minFormatScore: 0,
    cutoffFormatScore: 0,
    formatItems: [],
    items: [],
    ...overrides,
  };
}

/**
 * Ported from QualityProfile.FirstAllowedQuality(). Throws (matching C#'s
 * `Items.First(...)` behavior on an empty/no-match sequence -- .NET's
 * `InvalidOperationException: Sequence contains no matching element`) if no
 * item is allowed.
 */
export function firstAllowedQuality(profile: QualityProfile): Quality {
  const firstAllowed = profile.items.find((q) => q.allowed);
  if (!firstAllowed) {
    throw new Error("Sequence contains no matching element");
  }

  if (firstAllowed.quality !== null) {
    return firstAllowed.quality;
  }

  // Returning any item from the group will work,
  // returning the first because it's the true first quality.
  const first = firstAllowed.items[0];
  if (!first) {
    throw new Error("Sequence contains no elements");
  }
  return first.quality as Quality;
}

/** Ported from QualityProfile.LastAllowedQuality(). */
export function lastAllowedQuality(profile: QualityProfile): Quality {
  const allowedItems = profile.items.filter((q) => q.allowed);
  const lastAllowed = allowedItems[allowedItems.length - 1];
  if (!lastAllowed) {
    throw new Error("Sequence contains no matching element");
  }

  if (lastAllowed.quality !== null) {
    return lastAllowed.quality;
  }

  // Returning any item from the group will work,
  // returning the last because it's the true last quality.
  const lastGroupItem = lastAllowed.items[lastAllowed.items.length - 1];
  if (!lastGroupItem) {
    throw new Error("Sequence contains no elements");
  }
  return lastGroupItem.quality as Quality;
}

/**
 * Ported from QualityProfile.GetIndex(int id, bool respectGroupOrder).
 * The `Quality` overload just extracts `quality.id` and delegates, so it's
 * folded into a single function with an id-or-Quality first argument.
 */
export function getIndex(
  profile: QualityProfile,
  idOrQuality: number | Quality,
  respectGroupOrder = false
): QualityIndex {
  const id = typeof idOrQuality === "number" ? idOrQuality : idOrQuality.id;

  for (let i = 0; i < profile.items.length; i++) {
    const item = profile.items[i];
    if (!item) {
      continue;
    }
    const quality = item.quality;

    // Quality matches by ID
    if (quality !== null && quality.id === id) {
      return new QualityIndex(i);
    }

    // Group matches by ID
    if (item.id > 0 && item.id === id) {
      return new QualityIndex(i);
    }

    for (let g = 0; g < item.items.length; g++) {
      const groupItem = item.items[g];
      if (groupItem && groupItem.quality !== null && groupItem.quality.id === id) {
        return respectGroupOrder ? new QualityIndex(i, g) : new QualityIndex(i);
      }
    }
  }

  return new QualityIndex();
}

/** Ported from QualityProfile.CalculateCustomFormatScore(List<CustomFormat> formats). */
export function calculateCustomFormatScore(
  profile: QualityProfile,
  formats: CustomFormat[]
): number {
  const formatIds = new Set(formats.map((f) => f.id));
  return profile.formatItems
    .filter((x) => formatIds.has(x.format.id))
    .reduce((sum, x) => sum + x.score, 0);
}

/**
 * Adapts a `QualityProfile` to the Qualities module's `QualityProfileLike`
 * structural interface (`{ getIndex(qualityId, respectGroupOrder) }`), so a
 * real profile can be passed to `new QualityModelComparer(...)`. See the
 * RECONCILIATION note in this file's header.
 */
export function asQualityProfileLike(profile: QualityProfile): {
  getIndex(qualityId: number, respectGroupOrder?: boolean): QualityIndex;
} {
  return {
    getIndex: (qualityId, respectGroupOrder = false) =>
      getIndex(profile, qualityId, respectGroupOrder),
  };
}

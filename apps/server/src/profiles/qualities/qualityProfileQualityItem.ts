import type { Quality } from "../../qualities/quality.js";

/**
 * Ported from NzbDrone.Core/Profiles/Qualities/QualityProfileQualityItem.cs.
 *
 * `IEmbeddedDocument`: never its own table, always JSON-serialized inside
 * QualityProfile.Items ("QualityProfiles"."Items" column). A leaf item has
 * `quality` set and `items` empty; a group item has `quality` null/undefined,
 * a `name`, and `items` populated with the group's member qualities (mirrors
 * the C# nullable-reference-typed `Quality` field, `null` for groups).
 *
 * `id` here is the *group* id (C#'s `[JsonIgnore(Condition =
 * WhenWritingDefault)] Id`, used only for group items so QualityProfile.
 * GetIndex can match a group by id -- leaf items keep `id: 0`, the JSON
 * serializer omits it for those in the real app but the TS JSON.stringify
 * round-trip keeps it as 0, which is behaviorally equivalent since GetIndex's
 * `item.Id > 0` check treats 0 as "no group id" either way).
 */
export interface QualityProfileQualityItem {
  id: number;
  name: string | null;
  quality: Quality | null;
  items: QualityProfileQualityItem[];
  allowed: boolean;
}

export function newQualityItem(
  overrides: Partial<QualityProfileQualityItem> = {}
): QualityProfileQualityItem {
  return {
    id: 0,
    name: null,
    quality: null,
    items: [],
    allowed: false,
    ...overrides,
  };
}

/** Ported from QualityProfileQualityItem.GetQualities(). */
export function getQualities(item: QualityProfileQualityItem): Quality[] {
  if (item.quality === null) {
    return item.items.map((s) => s.quality as Quality);
  }

  return [item.quality];
}

/** Ported from QualityProfileQualityItem.ToString(). */
export function qualityItemToString(item: QualityProfileQualityItem): string {
  const qualitiesString = getQualities(item)
    .map((q) => q.name)
    .join(", ");

  if (item.name != null && item.name.trim() !== "") {
    return `${item.name} (${qualitiesString})`;
  }

  return qualitiesString;
}

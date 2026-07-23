import type { ModelBase } from "../../db/model-base.js";

/**
 * Ported from NzbDrone.Core/Profiles/Releases/ReleaseProfile.cs.
 *
 * The C# class also defines `ReleaseProfilePreferredComparer`
 * (`IComparer<KeyValuePair<string,int>>`, descending-by-value), a leftover
 * from before migration 026_add_custom_formats.cs removed the `Preferred`
 * column/concept (Preferred Words became CustomFormats -- see this repo's
 * ported 0026_add_custom_formats.sql for the historical note). It's kept
 * unused in the C# source to this day; not ported here since nothing calls
 * it and Preferred Words no longer exist on this model.
 */
export interface ReleaseProfile extends ModelBase {
  enabled: boolean;
  required: string[];
  ignored: string[];
  indexerId: number;
  tags: Set<number>;
}

export function newReleaseProfile(overrides: Partial<ReleaseProfile> = {}): ReleaseProfile {
  return {
    id: 0,
    enabled: true,
    required: [],
    ignored: [],
    indexerId: 0,
    tags: new Set<number>(),
    ...overrides,
  };
}

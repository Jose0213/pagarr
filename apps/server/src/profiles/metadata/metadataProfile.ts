import type { ModelBase } from "../../db/model-base.js";

/** Ported from NzbDrone.Core/Profiles/Metadata/MetadataProfile.cs. */
export interface MetadataProfile extends ModelBase {
  name: string;
  minPopularity: number;
  skipMissingDate: boolean;
  skipMissingIsbn: boolean;
  skipPartsAndSets: boolean;
  skipSeriesSecondary: boolean;
  allowedLanguages: string | null;
  minPages: number;
  ignored: string[];
}

export function newMetadataProfile(overrides: Partial<MetadataProfile> = {}): MetadataProfile {
  return {
    id: 0,
    name: "",
    minPopularity: 0,
    skipMissingDate: false,
    skipMissingIsbn: false,
    skipPartsAndSets: false,
    skipSeriesSecondary: false,
    allowedLanguages: null,
    minPages: 0,
    ignored: [],
    ...overrides,
  };
}

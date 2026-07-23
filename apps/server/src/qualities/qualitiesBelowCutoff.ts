/**
 * Ported from NzbDrone.Core/Qualities/QualitiesBelowCutoff.cs -- a small DTO
 * (not a persisted model) pairing a Profiles-module profile id with the
 * quality ids that fall below that profile's cutoff. Used by history/
 * upgrade-eligibility call sites in later-ported modules (DecisionEngine,
 * MediaFiles); this module only carries the shape forward.
 */
export interface QualitiesBelowCutoff {
  profileId: number;
  qualityIds: readonly number[];
}

/** Ported from `QualitiesBelowCutoff(int profileId, IEnumerable<int> qualityIds)`. */
export function newQualitiesBelowCutoff(
  profileId: number,
  qualityIds: readonly number[]
): QualitiesBelowCutoff {
  return { profileId, qualityIds };
}

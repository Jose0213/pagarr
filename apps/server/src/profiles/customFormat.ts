/**
 * Local stand-in for NzbDrone.Core/CustomFormats/CustomFormat.cs, referenced
 * by ProfileFormatItem.Format and QualityProfile.CalculateCustomFormatScore.
 *
 * DEVIATION: The CustomFormats module has not been ported yet (it's a
 * separate module from Profiles in the real source tree, under
 * NzbDrone.Core/CustomFormats/, not NzbDrone.Core/Profiles/), so this
 * defines the minimal shape Profiles actually touches: `Id` (for equality/
 * lookup, per QualityProfileRepository's Query() re-hydration and
 * QualityProfileService's CustomFormatAddedEvent/CustomFormatDeletedEvent
 * handlers) and `Name` (for readability/tests). When the CustomFormats
 * module is ported, this should be replaced by the real type -- the JSON
 * shape written to the DB (ProfileFormatItem's `{ Format: {...}, Score }`)
 * should stay compatible since both are `IEmbeddedDocument`s serialized
 * as-is.
 */
export interface CustomFormat {
  id: number;
  name: string;
}

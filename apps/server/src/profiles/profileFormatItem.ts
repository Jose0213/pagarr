import type { CustomFormat } from "./customFormat.js";

/**
 * Ported from NzbDrone.Core/Profiles/ProfileFormatItem.cs.
 *
 * C#'s `IEmbeddedDocument` marker means this is never its own DB row/table --
 * it's serialized as JSON inside QualityProfile.FormatItems (the
 * "QualityProfiles"."FormatItems" column). No behavior beyond the two data
 * fields.
 */
export interface ProfileFormatItem {
  format: CustomFormat;
  score: number;
}

/**
 * Ported from NzbDrone.Core/Qualities/QualityDetectionSource.cs.
 *
 * Represented as a string-literal union rather than a numeric TS `enum`,
 * matching this module's other small C# enums (see properDownloadTypes.ts) --
 * nothing in this module round-trips the numeric ordinal, and
 * `QualityModel.QualityDetectionSource` is `[JsonIgnore]` in the C# source
 * (not persisted), so there's no serialization format to preserve either.
 */
export const QUALITY_DETECTION_SOURCE_VALUES = ["Name", "Extension", "TagLib", "Category"] as const;
export type QualityDetectionSource = (typeof QUALITY_DETECTION_SOURCE_VALUES)[number];

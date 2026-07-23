/**
 * Ported from VersOne.Epub.Schema/EpubVersion.cs.
 *
 * C# enum with a `[VersionString(...)]` attribute per member, read via
 * reflection in VersionUtils.cs to map the enum back to its OPF
 * `version="..."` string. Ported as a string-literal union (this module's
 * convention for small C# enums with no persisted numeric ordinal, see
 * qualityDetectionSource.ts) -- the "enum -> version string" direction is
 * exactly the reverse of PackageReader.ts's `version="..."` switch that
 * produces one of these values in the first place, so a separate
 * "getVersionString" lookup table (mirroring VersionUtils.cs) is kept here
 * for `EpubPackage.getVersionString()`.
 */
export const EPUB_VERSION_VALUES = ["EPUB_2", "EPUB_3_0", "EPUB_3_1"] as const;
export type EpubVersion = (typeof EPUB_VERSION_VALUES)[number];

/** Ported from `VersionUtils.GetVersionString(EpubVersion)` / the `[VersionString]` attributes on EpubVersion.cs. */
const VERSION_STRINGS: Readonly<Record<EpubVersion, string>> = {
  EPUB_2: "2.0",
  EPUB_3_0: "3.0",
  EPUB_3_1: "3.1",
};

export function epubVersionToString(version: EpubVersion): string {
  return VERSION_STRINGS[version];
}

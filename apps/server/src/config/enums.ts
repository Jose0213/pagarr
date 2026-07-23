/**
 * Ported from NzbDrone.Core/Configuration/*.cs (small C# enums) and a handful
 * of enums from sibling namespaces that ConfigService.cs / ConfigFileProvider.cs
 * reference as property types. Represented as TypeScript string-literal union
 * types (rather than numeric `enum`) so that the values read/written to the
 * key-value store and the config file are the same human-readable strings the
 * C# `Enum.Parse` / `.ToString().ToLower()` round-trip produced -- see
 * ConfigService.GetValueEnum / SetValue(string, Enum) in ConfigService.cs,
 * which lower-cases enum names before persisting and parses case-insensitively
 * on read.
 *
 * Where the C# enum had explicit numeric values, they're preserved as a
 * comment for reference, since nothing in this module actually round-trips
 * enums as integers (Config.Value is always a string in the DB, and the
 * config.xml equivalent is a JSON file with string enum members here).
 */

// --- Ported from Configuration/AllowFingerprinting.cs ---
export const ALLOW_FINGERPRINTING_VALUES = ["Never", "NewFiles", "AllFiles"] as const;
export type AllowFingerprinting = (typeof ALLOW_FINGERPRINTING_VALUES)[number];

// --- Ported from Configuration/RescanAfterRefreshType.cs ---
export const RESCAN_AFTER_REFRESH_TYPE_VALUES = ["Always", "AfterManual", "Never"] as const;
export type RescanAfterRefreshType = (typeof RESCAN_AFTER_REFRESH_TYPE_VALUES)[number];

// --- Ported from Configuration/WriteAudioTagsType.cs ---
export const WRITE_AUDIO_TAGS_TYPE_VALUES = ["No", "NewFiles", "AllFiles", "Sync"] as const;
export type WriteAudioTagsType = (typeof WRITE_AUDIO_TAGS_TYPE_VALUES)[number];

// --- Ported from Configuration/WriteBookTagsType.cs ---
export const WRITE_BOOK_TAGS_TYPE_VALUES = ["NewFiles", "AllFiles", "Sync"] as const;
export type WriteBookTagsType = (typeof WRITE_BOOK_TAGS_TYPE_VALUES)[number];

// --- Ported from Qualities/ProperDownloadTypes.cs (referenced by ConfigService.DownloadPropersAndRepacks) ---
export const PROPER_DOWNLOAD_TYPES_VALUES = [
  "PreferAndUpgrade",
  "DoNotUpgrade",
  "DoNotPrefer",
] as const;
export type ProperDownloadTypes = (typeof PROPER_DOWNLOAD_TYPES_VALUES)[number];

// --- Ported from MediaFiles/FileDateType.cs (referenced by ConfigService.FileDate) ---
// C# values: None = 0, BookReleaseDate = 1
export const FILE_DATE_TYPE_VALUES = ["None", "BookReleaseDate"] as const;
export type FileDateType = (typeof FILE_DATE_TYPE_VALUES)[number];

// --- Ported from Http/Proxy/ProxyType.cs (referenced by ConfigService.ProxyType) ---
export const PROXY_TYPE_VALUES = ["Http", "Socks4", "Socks5"] as const;
export type ProxyType = (typeof PROXY_TYPE_VALUES)[number];

// --- Ported from Security/CertificateValidationType.cs (referenced by ConfigService.CertificateValidation) ---
// C# values: Enabled = 0, DisabledForLocalAddresses = 1, Disabled = 2
export const CERTIFICATE_VALIDATION_TYPE_VALUES = [
  "Enabled",
  "DisabledForLocalAddresses",
  "Disabled",
] as const;
export type CertificateValidationType = (typeof CERTIFICATE_VALIDATION_TYPE_VALUES)[number];

// --- Ported from Authentication/AuthenticationType.cs (referenced by ConfigFileProvider.AuthenticationMethod) ---
// C# values: None = 0, Basic = 1, Forms = 2, External = 3
export const AUTHENTICATION_TYPE_VALUES = ["None", "Basic", "Forms", "External"] as const;
export type AuthenticationType = (typeof AUTHENTICATION_TYPE_VALUES)[number];

// --- Ported from Authentication/AuthenticationRequiredType.cs ---
// C# values: Enabled = 0, DisabledForLocalAddresses = 1
export const AUTHENTICATION_REQUIRED_TYPE_VALUES = [
  "Enabled",
  "DisabledForLocalAddresses",
] as const;
export type AuthenticationRequiredType = (typeof AUTHENTICATION_REQUIRED_TYPE_VALUES)[number];

// --- Ported from Update/UpdateMechanism.cs (referenced by ConfigFileProvider.UpdateMechanism) ---
// C# values: BuiltIn = 0, Script = 1, External = 10, Apt = 11, Docker = 12
export const UPDATE_MECHANISM_VALUES = ["BuiltIn", "Script", "External", "Apt", "Docker"] as const;
export type UpdateMechanism = (typeof UPDATE_MECHANISM_VALUES)[number];

/** C# `IsExternalUpdateMechanism => PackageUpdateMechanism >= UpdateMechanism.External` (numeric >= 10). */
export function isExternalUpdateMechanism(mechanism: UpdateMechanism): boolean {
  return mechanism === "External" || mechanism === "Apt" || mechanism === "Docker";
}

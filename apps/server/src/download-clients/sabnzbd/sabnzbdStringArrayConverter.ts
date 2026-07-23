/**
 * Ported from NzbDrone.Core/Download/Clients/Sabnzbd/JsonConverters/
 * SabnzbdStringArrayConverter.cs's `ReadJson`: on some properties SAB
 * serializes an array of a single item as a plain string. Used for
 * `SabnzbdConfigMisc.date_categories` (see SabnzbdCategory.ts).
 */
export function parseSabnzbdStringArray(value: unknown): string[] {
  if (value === null || value === undefined) {
    return [String(value)];
  }
  if (typeof value === "string") {
    return [value];
  }
  if (Array.isArray(value)) {
    return value as string[];
  }
  throw new Error("Expected array");
}

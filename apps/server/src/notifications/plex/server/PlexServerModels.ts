/**
 * Ported from NzbDrone.Core/Notifications/Plex/Server/PlexError.cs,
 * PlexIdentity.cs, PlexPreferences.cs, PlexResponse.cs, PlexSection.cs,
 * PlexSectionItem.cs.
 *
 * C#'s `[JsonProperty("key")]`/`[JsonProperty("Location")]`/etc attributes
 * (Newtonsoft.Json field-name remapping for the "legacy" vs "new" Plex JSON
 * shapes) are handled at the call site in PlexServerProxy.ts via explicit
 * field mapping after `JSON.parse`, not via decorator-driven
 * deserialization -- this port has no JSON-attribute-based (de)serializer
 * (same approach every other module here takes for Newtonsoft attributes,
 * e.g. indexers' RssParser.ts manual field mapping).
 */

export interface PlexError {
  error: string | null;
}

export interface PlexIdentity {
  machineIdentifier: string;
  version: string;
}

export interface PlexPreference {
  id: string;
  type: string;
  value: string;
}

/** Ported from PlexPreferences.cs: `[JsonProperty("Setting")] List<PlexPreference> Preferences`. */
export interface PlexPreferences {
  preferences: PlexPreference[];
}

/** Ported from PlexPreferencesLegacy.cs: `[JsonProperty("_children")] List<PlexPreference> Preferences`. */
export interface PlexPreferencesLegacy {
  preferences: PlexPreference[];
}

export interface PlexResponse<T> {
  mediaContainer: T;
}

export interface PlexSectionLocation {
  id: number;
  path: string;
}

/** Ported from PlexSection.cs. Ctor initializes `Locations = new List<...>()` -- see `newPlexSection()`. */
export interface PlexSection {
  id: number;
  type: string;
  language: string | null;
  locations: PlexSectionLocation[];
}

export function newPlexSection(overrides: Partial<PlexSection> = {}): PlexSection {
  return { id: 0, type: "", language: null, locations: [], ...overrides };
}

export interface PlexSectionsContainer {
  sections: PlexSection[];
}

export function newPlexSectionsContainer(): PlexSectionsContainer {
  return { sections: [] };
}

export interface PlexSectionLegacy {
  id: number;
  type: string;
  language: string | null;
  locations: PlexSectionLocation[];
}

export interface PlexMediaContainerLegacy {
  sections: PlexSectionLegacy[];
}

export interface PlexSectionItem {
  id: string;
  title: string;
  year: number;
  guid: string;
}

export interface PlexSectionResponse {
  items: PlexSectionItem[];
}

export function newPlexSectionResponse(): PlexSectionResponse {
  return { items: [] };
}

export interface PlexSectionResponseLegacy {
  items: PlexSectionItem[];
}

export function newPlexSectionResponseLegacy(): PlexSectionResponseLegacy {
  return { items: [] };
}

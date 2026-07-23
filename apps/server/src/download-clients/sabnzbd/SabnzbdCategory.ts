import { OsPath } from "../OsPath.js";

/**
 * Ported from NzbDrone.Core/Download/Clients/Sabnzbd/SabnzbdCategory.cs.
 *
 * C#'s `Json.Deserialize` uses a `CamelCasePropertyNamesContractResolver`
 * for every property without an explicit `[JsonProperty(PropertyName = "...")]`
 * override (see SabnzbdHistoryItem.ts's doc comment for the full
 * explanation + citation) -- so `SabnzbdCategory`'s `Priority`/`PP`/`Name`/
 * `Script`/`Dir` (no explicit attributes) round-trip as lowerCamelCase on
 * the wire, not PascalCase. `SabnzbdConfigMisc`'s fields already match their
 * wire names literally (they're declared lowercase/snake_case in the C#
 * source itself, e.g. `public string complete_dir`), so no casing
 * transformation applies there.
 *
 * `SabnzbdConfigMisc.date_categories` field-level
 * `[JsonConverter(typeof(SabnzbdStringArrayConverter))]` is handled at the
 * deserialization boundary in Sabnzbd.ts, via `parseSabnzbdStringArray()`
 * (sabnzbdStringArrayConverter.ts).
 */
export interface SabnzbdConfigMisc {
  complete_dir: string;
  tv_categories: string[];
  enable_tv_sorting: boolean;
  movie_categories: string[];
  enable_movie_sorting: boolean;
  date_categories: string[];
  enable_date_sorting: boolean;
  pre_check: boolean;
  history_retention: string;
  history_retention_option: string;
  history_retention_number: number;
}

export interface SabnzbdCategory {
  priority: number;
  pp: string;
  name: string;
  script: string;
  dir: string;

  /** Not part of the wire JSON -- populated by Sabnzbd.ts's `getCategories()`, matching the C# `[JsonIgnore]`-implicit (settable, non-serialized-in) `FullPath` property. */
  fullPath: OsPath;
}

export function createSabnzbdCategory(overrides: Partial<SabnzbdCategory> = {}): SabnzbdCategory {
  return {
    priority: 0,
    pp: "",
    name: "",
    script: "",
    dir: "",
    fullPath: OsPath.empty(),
    ...overrides,
  };
}

export interface SabnzbdConfig {
  misc: SabnzbdConfigMisc;
  categories: SabnzbdCategory[];
  servers: unknown[];
}

/** Ported from `SabnzbdConfig`'s default ctor (`Categories`/`Servers` initialized to empty lists). */
export function createSabnzbdConfig(overrides: Partial<SabnzbdConfig> = {}): SabnzbdConfig {
  return {
    misc: createSabnzbdConfigMisc(),
    categories: [],
    servers: [],
    ...overrides,
  };
}

export function createSabnzbdConfigMisc(
  overrides: Partial<SabnzbdConfigMisc> = {}
): SabnzbdConfigMisc {
  return {
    complete_dir: "",
    tv_categories: [],
    enable_tv_sorting: false,
    movie_categories: [],
    enable_movie_sorting: false,
    date_categories: [],
    enable_date_sorting: false,
    pre_check: false,
    history_retention: "",
    history_retention_option: "",
    history_retention_number: 0,
    ...overrides,
  };
}

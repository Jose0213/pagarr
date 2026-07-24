import type { FieldDefinition } from "../../client-schema/SchemaBuilder.js";
import {
  asBoolean,
  asInt,
  asIntArray,
  asNullableFloat,
  asNullableInt,
  asString,
} from "../../client-schema/SchemaBuilder.js";
import type { IProviderConfig } from "../../../thingi-provider/index.js";
import {
  createNewznabSettings,
  type NewznabSettings,
} from "../../../indexers/newznab/newznabSettings.js";
import {
  createTorznabSettings,
  type TorznabSettings,
} from "../../../indexers/torznab/torznabSettings.js";
import { MINIMUM_SEEDERS } from "../../../indexers/IndexerDefaults.js";

/**
 * Ported from NzbDrone.Core/Indexers/Newznab/NewznabSettings.cs +
 * NzbDrone.Core/Indexers/Torznab/TorznabSettings.cs's `[FieldDefinition]`-
 * decorated properties (the reflection-discovered field metadata
 * `SchemaBuilder.ToSchema`/`ReadFromSchema` walked in the real C# source).
 * `SchemaBuilder.ts` (this port's own client-schema module) has no
 * reflection -- see that file's doc comment -- so each settings shape's
 * field list is declared explicitly here instead, one `FieldDefinition[]`
 * per protocol, matching order/labels/types 1:1 against the real
 * `[FieldDefinition(N, Label = "...", ...)]` attribute values.
 *
 * `EarlyReleaseLimit`/`BaseUrl` come from the shared `IIndexerSettings`
 * base; `Categories`/`ApiPath`/`ApiKey`/`AdditionalParameters` from
 * `NewznabSettings`; `MinimumSeeders`/`SeedCriteria`/
 * `RejectBlocklistedTorrentHashesWhileGrabbing` are Torznab-only additions
 * from `ITorrentIndexerSettings`.
 *
 * `Categories`'s real C# `type: "categories"` / `SelectOptionsProviderAction
 * = "newznabCategories"` (a dynamic, capabilities-fetched select list --
 * `NewznabController`/`IndexerController`'s `GetCategories` action, not
 * ported in this task's scope) is represented here as a plain
 * `selectOptionsProviderAction` string on the field, matching
 * `FieldDefinition`'s own `selectOptionsProviderAction` slot -- the real
 * dynamic-options endpoint isn't part of Indexers/Search/Parse's scope, so
 * no `selectOptions` array is populated; a client reading `GET /indexer/schema`
 * still gets the field with its `type`/`selectOptionsProviderAction`
 * metadata, matching what a category-less definition looks like before its
 * options are ever fetched.
 *
 * `SeedCriteria` (a nested settings object on `TorrentIndexerSettings`) is
 * flattened into three top-level dotted-name fields (`seedCriteria.seedRatio`
 * /`seedCriteria.seedTime`/`seedCriteria.discographySeedTime`) rather than
 * recursed into via a nested-settings builder -- `SchemaBuilder.ts`'s doc
 * comment explicitly calls this out as the documented substitute for the
 * real reflection-driven dotted-`prefix` recursion (`ToSchema`'s nested
 * settings handling): "a concrete settings module that has nested
 * sub-groups declares those as flat dotted `name`s directly in its own
 * `FieldDefinition[]`".
 */

const NEWZNAB_BASE_FIELDS: FieldDefinition<NewznabSettings>[] = [
  {
    name: "baseUrl",
    label: "URL",
    type: "textbox",
    order: 0,
    get: (s) => s.baseUrl,
    set: (s, v) => {
      s.baseUrl = asString(v);
    },
  },
  {
    name: "apiPath",
    label: "API Path",
    type: "textbox",
    advanced: true,
    helpText: "Path to the api, usually /api",
    order: 1,
    get: (s) => s.apiPath,
    set: (s, v) => {
      s.apiPath = asString(v, "/api");
    },
  },
  {
    name: "apiKey",
    label: "API Key",
    type: "textbox",
    order: 2,
    get: (s) => s.apiKey,
    set: (s, v) => {
      s.apiKey = asString(v);
    },
  },
  {
    name: "categories",
    label: "Categories",
    type: "select",
    selectOptionsProviderAction: "newznabCategories",
    helpText: "Comma Separated list, leave blank to disable",
    order: 3,
    get: (s) => s.categories,
    set: (s, v) => {
      s.categories = asIntArray(v);
    },
  },
  {
    name: "earlyReleaseLimit",
    label: "Early Download Limit",
    type: "number",
    unit: "days",
    helpText:
      "Time before release date Readarr will grab a release, leave blank to disable early grabbing",
    advanced: true,
    order: 4,
    get: (s) => s.earlyReleaseLimit,
    set: (s, v) => {
      s.earlyReleaseLimit = asNullableInt(v);
    },
  },
  {
    name: "additionalParameters",
    label: "Additional Parameters",
    type: "textbox",
    advanced: true,
    helpText:
      "Additional Newznab parameters, i.e. &author=readarr&text=readarr. Don't duplicate existing parameters.",
    order: 5,
    get: (s) => s.additionalParameters,
    set: (s, v) => {
      s.additionalParameters = asString(v);
    },
  },
];

export const NEWZNAB_FIELD_DEFS: FieldDefinition<NewznabSettings>[] = NEWZNAB_BASE_FIELDS;

/**
 * Ported from `TorznabSettings`'s field list: the same Newznab base fields
 * (Torznab's settings class extends NewznabSettings in C#, see
 * torznabSettings.ts's doc comment) plus the three Torrent-specific fields.
 */
export const TORZNAB_FIELD_DEFS: FieldDefinition<TorznabSettings>[] = [
  ...NEWZNAB_BASE_FIELDS.map((def) => ({
    ...def,
    get: (s: TorznabSettings) => def.get(s),
    set: (s: TorznabSettings, v: unknown) => {
      def.set(s, v);
    },
  })),
  {
    name: "minimumSeeders",
    label: "Minimum Seeders",
    type: "number",
    advanced: true,
    helpText: "Minimum number of seeders required.",
    order: 6,
    get: (s) => s.minimumSeeders,
    set: (s, v) => {
      s.minimumSeeders = asInt(v, MINIMUM_SEEDERS);
    },
  },
  {
    name: "seedCriteria.seedRatio",
    label: "Seed Ratio",
    type: "number",
    isFloat: true,
    advanced: true,
    helpText:
      "The ratio a torrent should reach before stopping, empty uses download client's default",
    order: 7,
    get: (s) => s.seedCriteria.seedRatio,
    set: (s, v) => {
      s.seedCriteria.seedRatio = asNullableFloat(v);
    },
  },
  {
    name: "seedCriteria.seedTime",
    label: "Seed Time",
    type: "number",
    unit: "minutes",
    advanced: true,
    helpText:
      "The time a torrent should be seeded before stopping, empty uses download client's default",
    order: 8,
    get: (s) => s.seedCriteria.seedTime,
    set: (s, v) => {
      s.seedCriteria.seedTime = asNullableInt(v);
    },
  },
  {
    name: "seedCriteria.discographySeedTime",
    label: "Discography Seed Time",
    type: "number",
    unit: "minutes",
    advanced: true,
    helpText:
      "The time a torrent should be seeded before stopping, empty uses download client's default, this only applies to discography packs",
    order: 9,
    get: (s) => s.seedCriteria.discographySeedTime,
    set: (s, v) => {
      s.seedCriteria.discographySeedTime = asNullableInt(v);
    },
  },
  {
    name: "rejectBlocklistedTorrentHashesWhileGrabbing",
    label: "Reject Blocklisted Torrent Hashes During Grab",
    type: "checkbox",
    advanced: true,
    helpText:
      "Enable if this indexer should reject sending Blocklisted Torrent hashes to download client",
    order: 10,
    get: (s) => s.rejectBlocklistedTorrentHashesWhileGrabbing,
    set: (s, v) => {
      s.rejectBlocklistedTorrentHashesWhileGrabbing = asBoolean(v);
    },
  },
];

/** `createDefaultSettings` factories for `ProviderSettingsSchema` -- see ProviderResource.ts. */
export function createDefaultNewznabSettings(): NewznabSettings {
  return createNewznabSettings();
}

export function createDefaultTorznabSettings(): TorznabSettings {
  return createTorznabSettings();
}

export type { NewznabSettings, TorznabSettings, IProviderConfig };

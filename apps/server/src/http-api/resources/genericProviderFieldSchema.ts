import type { IProviderConfig } from "../../thingi-provider/index.js";
import type { FieldDefinition } from "../client-schema/SchemaBuilder.js";

/**
 * Shared helper for the two provider-kind resource groups whose settings
 * shape genuinely varies per-implementation (DownloadClient: QBittorrent /
 * Sabnzbd / TorrentBlackhole / UsenetBlackhole; Notifications: 22 distinct
 * notifier settings types) -- see this module's task report for the full
 * "why a generic mapper, not one static per-type FieldDefinition[]"
 * rationale.
 *
 * ## The problem this solves
 *
 * `http-api/rest/ProviderResource.ts`'s `ProviderSettingsSchema<TProviderConfig>`
 * (consumed by `providerControllerBase()`) expects exactly ONE
 * `FieldDefinition<TProviderConfig>[]` array for the WHOLE controller --
 * `client-schema/SchemaBuilder.ts`'s `buildFieldSchema`/`readFromFieldSchema`
 * iterate that fixed array, calling each definition's own `get`/`set`
 * against whichever live settings instance is in hand. In the real C#,
 * `SchemaBuilder.ToSchema`/`ReadFromSchema` instead dispatch on the
 * settings object's *runtime type* (reflection, resolved from
 * `ConfigContract`), so each concrete provider implementation effectively
 * gets its own field mapping for free -- there is no equivalent dispatch
 * point in this port's `buildFieldSchema`/`readFromFieldSchema` (both take
 * one fixed `fieldDefs` array, not a per-instance-varying one), and no
 * existing per-implementation `FieldDefinition[]` arrays exist anywhere in
 * this port to plug in even if there were (`Field`/`SchemaBuilder` are new
 * Phase 5 concepts; none of the 4 download-client settings modules or 22
 * notifier settings modules -- all Phase 3/4 -- declare one).
 *
 * ## The generic, reflection-free substitute: a union schema
 *
 * Rather than invent 26 new `FieldDefinition[]` arrays (one per concrete
 * settings type -- out of scope; those modules belong to other tasks) or
 * require `buildFieldSchema` itself to support per-instance-varying
 * definitions (out of scope -- it's the shared, already-merged
 * `client-schema/` module), this module builds ONE `FieldDefinition
 * <IProviderConfig>[]` per controller by taking the UNION of every
 * registered implementation's own default-settings keys (known statically
 * at controller-construction time from each provider's own
 * `createXSettings()` factory / `defaultDefinitions[0].settings`) and
 * generating one generic, key-agnostic definition per union member. Each
 * definition's `get`/`set` tolerates the key being ABSENT on whichever
 * concrete settings instance is actually live for a given definition
 * (`key in settings` guard) -- e.g. QBittorrent's `musicCategory` key
 * simply never appears in the `fields[]` array `buildFieldSchema` produces
 * for a Sabnzbd definition, matching the real C# behavior where each
 * concrete settings TYPE only ever contributes its own properties (the
 * union here is a superset covering every type, but any single instance
 * only ever populates its own subset -- see `unionFieldDefs`'s "skip
 * entirely if absent" doc note).
 *
 * `validate` (a settings object's own method, not a data property) is
 * excluded everywhere -- C#'s reflection only walks *properties*, and
 * `Validate()` is a method, not a property, so this is a faithful analog,
 * not a narrowing.
 *
 * What's necessarily NOT reproduced (fundamentally can't be without
 * reflection or hand-authored per-type metadata, neither of which this
 * task's scope provides): `label`/`type`/`helpText`/`section`/`advanced`
 * display metadata (every generically-built field omits these -- wire
 * -compatible value carriers, without the rich form-rendering hints the
 * real UI's hand-annotated `[FieldDefinition]` attributes provided). Order
 * is derived from the union's own discovery order (each implementation's
 * `Object.keys()` insertion order, in provider-array order, de-duplicated)
 * -- stable and deterministic, just not independently meaningful the way a
 * hand-authored C# `Order` integer is.
 */

type SettingsRecord = Record<string, unknown>;

/** Ported from the reflection-driven `IsSimpleType()` gate `SchemaBuilder.GetFieldMapping` applies before treating a property as a leaf field -- `validate` (a function) is the one non-data member every settings object in this port carries; everything else is a JSON-safe scalar/array. */
function isDataKey(key: string, value: unknown): boolean {
  return key !== "validate" && typeof value !== "function";
}

/**
 * Builds a union `FieldDefinition<IProviderConfig>[]` from every sample
 * settings instance supplied (typically one default-settings instance per
 * registered concrete implementation) -- see module doc comment. Each
 * definition's `get` returns `undefined` (field omitted from the built
 * `Field[]` the same way an absent property naturally would be) when the
 * key isn't present on the live settings instance; `set` is a no-op when
 * the key isn't present, so posting e.g. QBittorrent's `musicCategory`
 * against a Sabnzbd definition harmlessly does nothing rather than
 * fabricating a property Sabnzbd's own settings type never declared.
 */
export function unionFieldDefs<TSettings extends IProviderConfig>(
  samples: TSettings[]
): FieldDefinition<TSettings>[] {
  const seen = new Set<string>();
  const defs: FieldDefinition<TSettings>[] = [];

  for (const sample of samples) {
    const record = sample as unknown as SettingsRecord;
    for (const key of Object.keys(record)) {
      if (seen.has(key) || !isDataKey(key, record[key])) {
        continue;
      }
      seen.add(key);

      const order = defs.length;
      defs.push({
        name: key,
        order,
        get: (settings: TSettings): unknown => {
          const target = settings as unknown as SettingsRecord;
          return key in target ? target[key] : undefined;
        },
        set: (settings: TSettings, value: unknown): void => {
          const target = settings as unknown as SettingsRecord;
          if (!(key in target)) {
            return;
          }
          target[key] = coerceLike(target[key], value);
        },
      });
    }
  }

  return defs;
}

/** Coerces `value` to match `sample`'s runtime type where the two disagree -- see module doc comment. Arrays/objects/undefined pass through raw (JSON-safe already); scalars are coerced defensively so a stringly-typed wire body (e.g. a numeric field posted as `"8080"`) still round-trips like SchemaBuilder's own int/bool converters would. */
/** Safe stringify for an `unknown` value -- avoids `no-base-to-string` on an arbitrary object (which would collapse to the useless "[object Object]"); mirrors `client-schema/SchemaBuilder.ts`'s `toDisplayString` helper. */
function toDisplayString(value: unknown): string {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value);
}

function coerceLike(sample: unknown, value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  switch (typeof sample) {
    case "number": {
      const n = typeof value === "number" ? value : Number(toDisplayString(value));
      return Number.isNaN(n) ? sample : n;
    }
    case "boolean":
      return typeof value === "boolean" ? value : toDisplayString(value).toLowerCase() === "true";
    case "string":
      return typeof value === "string" ? value : toDisplayString(value);
    default:
      return value;
  }
}

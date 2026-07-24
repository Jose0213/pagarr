import type { Field, FieldType } from "./Field.js";
import { cloneField } from "./Field.js";

/**
 * Ported from Readarr.Http/ClientSchema/SchemaBuilder.cs.
 *
 * ## The reflection problem and how this port adapts it
 *
 * C#'s `SchemaBuilder` walks a settings class's properties via reflection
 * at first use (`GetFieldMapping`, recursive over `[FieldDefinition]`-
 * decorated properties, including nested settings objects via a dotted
 * `prefix`), builds a `FieldMapping[]` once per settings `Type`, and caches
 * it in a static `Dictionary<Type, FieldMapping[]>`. `ToSchema(model)`
 * clones each cached mapping's `Field` and stamps in the live value via the
 * mapping's getter; `ReadFromSchema(fields, targetType)` does the reverse,
 * constructing a fresh settings instance and setting each property from the
 * matching field's `value` (running it through a property-type-driven
 * value converter -- int/long/double parsing, JsonElement array handling,
 * or a raw JSON deserialize fallback for complex types).
 *
 * This port has no runtime reflection, no `[FieldDefinition]` attribute,
 * and no `Activator.CreateInstance` -- per this task's brief, the piece to
 * port here is the BUILDER/MAPPER machinery itself, not a retrofit of every
 * existing settings class. A concrete settings module (a later Phase 5
 * resource-controller agent wiring up e.g. Indexers/DownloadClients/
 * Notifications) declares its own `FieldDefinition<TSettings>[]` --- the
 * explicit, hand-written substitute for what C# discovered via property
 * attributes -- and this module turns that declaration into the same
 * `Field[]`/round-trip behavior `ToSchema`/`ReadFromSchema` provided:
 *
 *   const fields: FieldDefinition<MySettings>[] = [
 *     { name: "host", label: "Host", type: "textbox", order: 0,
 *       get: (s) => s.host, set: (s, v) => { s.host = asString(v); } },
 *     ...
 *   ];
 *
 *   buildFieldSchema(settingsInstance, fields)       // -> Field[] (for GET responses)
 *   readFromFieldSchema(wireFields, fields, factory)  // -> TSettings (for POST/PUT bodies)
 *
 * ## What's carried over faithfully
 *
 *   - Order renumbering: `ToSchema`'s caller-visible `Order` values are
 *     reassigned 0..N-1 by array position (ported from
 *     `GetFieldMappings`'s post-scan "Renumber all the field Orders since
 *     nested settings will have dupe Orders" step) -- `buildFieldSchema`
 *     does the same renumbering over `fieldDefs`' declared order, so a
 *     caller doesn't need to hand-maintain globally-unique `order` values
 *     across a settings object with nested sub-groups any more than the C#
 *     source's callers did.
 *   - `ReadFromSchema`'s "field not present in submitted list -> leave
 *     target's default untouched" behavior: `readFromFieldSchema` only
 *     calls a definition's `set` when a matching wire field is found,
 *     exactly like C#'s `if (field != null) { mapping.SetterFunc(...) }`.
 *   - `Field.Clone()` before stamping the live value, so the definitions
 *     array's own `Field` template objects are never mutated by repeated
 *     `buildFieldSchema` calls (ported from `ToSchema`'s `mapping.Field.Clone()`).
 *
 * ## What's explicitly NOT carried over (and why)
 *
 *   - The reflection-driven nested-settings recursion (dotted `prefix`,
 *     e.g. `"advanced.timeout"`) -- a concrete settings module that has
 *     nested sub-groups declares those as flat dotted `name`s directly in
 *     its own `FieldDefinition[]` (the same "explicit over reflection"
 *     substitution, just at the leaf-naming level instead of a builder
 *     recursion step).
 *   - `_localizationService`-driven label/helpText token substitution
 *     (`GetTokens`/`FieldTokenAttribute`) -- Localization hasn't been
 *     ported in this port's scope yet; `FieldDefinition.label`/`helpText`
 *     are plain pre-resolved strings a concrete settings module supplies
 *     directly. A later localization pass can thread a lookup through this
 *     module's `label`/`helpText` fields without changing this file's
 *     shape.
 *   - `GetSelectOptions(Type selectOptions)`'s enum-reflection (`.NET`
 *     enum member -> `SelectOption` conversion via `FieldOptionAttribute`)
 *     -- a `FieldDefinition` with `type: "select"`/`"tagSelect"` supplies
 *     its `selectOptions: SelectOption[]` array directly (see Field.ts);
 *     there is no enum-reflection substitute needed since the caller
 *     already has the concrete list in hand at declaration time.
 *   - The value-converter dispatch's `JsonElement`-specific branches
 *     (`System.Text.Json`'s deserialized-but-not-yet-typed wire
 *     representation) -- this port's wire values arrive as already-parsed
 *     plain JS values (`JSON.parse` in Express's body parser, not a
 *     two-stage JsonElement), so `readFromFieldSchema` hands each
 *     definition's raw wire `value` straight to that definition's own
 *     `set` function, and the definition itself is responsible for any
 *     coercion (matching how a concrete provider settings module already
 *     knows its own field's real type, exactly as the C# per-property-type
 *     switch did per-property, just declared explicitly instead of
 *     dispatched via `propertyType == typeof(...)` checks).
 */

/** One settings-object field's full declaration: its wire metadata (a `Field` template, minus `value` -- populated per-instance by `buildFieldSchema`) plus explicit get/set closures over a concrete `TSettings` instance. The explicit substitute for a reflection-discovered `[FieldDefinition]`-decorated property. */
export interface FieldDefinition<TSettings> {
  name: string;
  label?: string;
  unit?: string;
  helpText?: string;
  helpTextWarning?: string;
  helpLink?: string;
  type?: FieldType;
  advanced?: boolean;
  selectOptions?: Field["selectOptions"];
  selectOptionsProviderAction?: string;
  section?: string;
  hidden?: string;
  placeholder?: string;
  isFloat?: boolean;
  /** Declared display order before renumbering -- ties broken by array position, matching `OrderBy(r => r.Order)`'s stable sort. */
  order: number;
  get: (settings: TSettings) => unknown;
  set: (settings: TSettings, value: unknown) => void;
}

/**
 * Ported from SchemaBuilder.ToSchema(object model): builds the live
 * `Field[]` for a settings instance from its explicit field-definition
 * list, renumbering `order` 0..N-1 by the definitions' own declared order
 * (stable sort, matching the C# post-scan renumbering step -- see module
 * doc comment).
 */
export function buildFieldSchema<TSettings>(
  settings: TSettings,
  fieldDefs: FieldDefinition<TSettings>[]
): Field[] {
  const ordered = [...fieldDefs].sort((a, b) => a.order - b.order);

  return ordered.map((def, index) => {
    const field: Field = cloneField({
      order: index,
      name: def.name,
      label: def.label,
      unit: def.unit,
      helpText: def.helpText,
      helpTextWarning: def.helpTextWarning,
      helpLink: def.helpLink,
      type: def.type,
      advanced: def.advanced ?? false,
      selectOptions: def.selectOptions,
      selectOptionsProviderAction: def.selectOptionsProviderAction,
      section: def.section,
      hidden: def.hidden,
      placeholder: def.placeholder,
      isFloat: def.isFloat ?? false,
    });
    field.value = def.get(settings);
    return field;
  });
}

/**
 * Ported from SchemaBuilder.ReadFromSchema(List<Field>, Type): constructs a
 * fresh `TSettings` via the supplied factory, then for each field
 * definition, finds the matching wire field by name and (only if found)
 * calls that definition's `set` with the wire value -- fields absent from
 * the submitted list leave the factory-produced default untouched, matching
 * C#'s `if (field != null)` guard.
 */
export function readFromFieldSchema<TSettings>(
  wireFields: Field[],
  fieldDefs: FieldDefinition<TSettings>[],
  createDefault: () => TSettings
): TSettings {
  const target = createDefault();

  for (const def of fieldDefs) {
    const wireField = wireFields.find((f) => f.name === def.name);
    if (wireField) {
      def.set(target, wireField.value);
    }
  }

  return target;
}

// ---- Value-coercion helpers ----------------------------------------------
//
// Ported from SchemaBuilder.GetValueConverter's per-propertyType branches.
// A concrete FieldDefinition.set implementation calls whichever of these
// matches its own settings property's real type -- the explicit substitute
// for the C# switch dispatching on `propertyType == typeof(...)`.

/**
 * `String(value)` on an `unknown` trips `@typescript-eslint/no-base-to-string`
 * (an arbitrary object would stringify to the useless "[object Object]").
 * Every real wire value these coercion helpers receive is a JSON scalar
 * (string/number/boolean) or array -- this narrows explicitly for those
 * cases and falls back to `JSON.stringify` for anything else, so a
 * non-scalar value fails loudly/comparably instead of silently collapsing
 * (same rationale as config/configFileProvider.ts's `stringifyConfigValue`,
 * which this mirrors).
 */
function toDisplayString(value: unknown): string {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value);
}

/** Ported from the `int`/`long` branch: `fieldValue?.ToString().ParseInt32() ?? 0`. */
export function asInt(value: unknown, defaultValue = 0): number {
  if (value === null || value === undefined) {
    return defaultValue;
  }
  const parsed = Number.parseInt(toDisplayString(value), 10);
  return Number.isNaN(parsed) ? defaultValue : parsed;
}

/** Ported from the `int?`/`long?` branch: `fieldValue?.ToString().ParseInt32()` (no default -- null passes through). */
export function asNullableInt(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const parsed = Number.parseInt(toDisplayString(value), 10);
  return Number.isNaN(parsed) ? null : parsed;
}

/** Ported from the `double` branch. */
export function asFloat(value: unknown, defaultValue = 0): number {
  if (value === null || value === undefined) {
    return defaultValue;
  }
  const parsed = Number.parseFloat(toDisplayString(value));
  return Number.isNaN(parsed) ? defaultValue : parsed;
}

/** Ported from the `double?` branch. */
export function asNullableFloat(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const parsed = Number.parseFloat(toDisplayString(value));
  return Number.isNaN(parsed) ? null : parsed;
}

/**
 * Ported from the `IEnumerable<int>` branch: accepts a real array (this
 * port's JSON body-parser equivalent of C#'s `JsonElement` array case) or a
 * comma-separated string (the form-post/legacy-client fallback the C#
 * source also supported), returning `[]` for null/undefined.
 */
export function asIntArray(value: unknown): number[] {
  if (value === null || value === undefined) {
    return [];
  }
  if (Array.isArray(value)) {
    return value.map((v) => Number(v));
  }
  return toDisplayString(value)
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((s) => Number(s));
}

/** Ported from the `IEnumerable<string>` branch. */
export function asStringArray(value: unknown): string[] {
  if (value === null || value === undefined) {
    return [];
  }
  if (Array.isArray(value)) {
    return value.map((v) => toDisplayString(v));
  }
  return toDisplayString(value)
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** Ported from the plain `string` case (falls through the C# switch to the JsonElement/deserialize branch, but a bare string value round-trips as itself). */
export function asString(value: unknown, defaultValue = ""): string {
  if (value === null || value === undefined) {
    return defaultValue;
  }
  return toDisplayString(value);
}

/** Ported from the `bool` case (also falls through to the generic branch in C#, since `SchemaBuilder`'s explicit switch doesn't special-case `bool` either -- JSON booleans round-trip as themselves through `System.Text.Json`, matched here directly). */
export function asBoolean(value: unknown, defaultValue = false): boolean {
  if (value === null || value === undefined) {
    return defaultValue;
  }
  if (typeof value === "boolean") {
    return value;
  }
  return toDisplayString(value).toLowerCase() === "true";
}

export type { Field };

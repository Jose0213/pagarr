/**
 * New file, no direct 1:1 C# source -- small shared helper.
 *
 * `NzbDrone.Common.Serializer.System.Text.Json.STJson.GetSerializerSettings()`
 * (`NzbDrone.Common/Serializer/System.Text.Json/STJson.cs`) registers
 * `new JsonStringEnumConverter(JsonNamingPolicy.CamelCase, true)` globally
 * for the whole API -- every C# enum property on every REST resource
 * (`CommandResource.Status`/`Priority`/`Result`/`Trigger`,
 * `HealthResource.Type`, etc.) serializes as its member's name in
 * camelCase, NOT its numeric ordinal. This port's domain-layer enums (e.g.
 * `messaging/commands/commandStatus.ts`'s `CommandStatus`,
 * `health-check/healthCheck.ts`'s `HealthCheckResult`) are plain numeric TS
 * enums, ported for shape/value fidelity with the C# enum's own ordinals
 * (see e.g. `healthCheck.ts`'s doc comment: "Values match the C# enum's
 * underlying ints") -- domain code compares/stores them as numbers, exactly
 * like the C# domain layer does before STJson's converter ever runs.
 *
 * `enumWireName()` is the API-resource-layer equivalent of that global
 * converter, applied explicitly at each resource mapper that has an enum
 * field (this port has no global JSON-serialization hook to register a
 * converter against -- `res.json()` has no interception point comparable to
 * `JsonSerializerOptions.Converters`), rather than silently leaving numeric
 * ordinals on the wire where the real API returns strings.
 */

/** A reverse-lookup table from a numeric TS enum's ordinal value to its member name, camelCased. Build once per enum via `buildEnumWireNames(EnumObject)`. */
export type EnumWireNames = ReadonlyMap<number, string>;

/**
 * Builds the ordinal -> camelCase-name lookup table for a numeric TS enum
 * object (e.g. `buildEnumWireNames(CommandStatus)`). TS numeric enums
 * produce a reverse mapping on the enum object itself
 * (`CommandStatus[0] === "Queued"`), which this walks and lower-cases each
 * name's first character to match `JsonNamingPolicy.CamelCase`'s behavior
 * on a single already-PascalCase word (camelCase and PascalCase differ only
 * in the first character's casing for a single-word identifier -- every
 * enum member name in this codebase's ported C# enums is a single
 * PascalCase word, e.g. `Queued`, `Warning`, `Manual`, never a
 * multi-word/already-delimited name that would need fuller camelCase
 * conversion).
 */
export function buildEnumWireNames(
  enumObject: Record<string | number, string | number>
): EnumWireNames {
  const map = new Map<number, string>();

  for (const key of Object.keys(enumObject)) {
    const value = enumObject[key];
    if (typeof value === "number") {
      map.set(value, lowerFirst(key));
    }
  }

  return map;
}

/** Looks up an enum ordinal's wire name, throwing if the table has no entry (an ordinal outside the enum's declared range would be a real bug -- fail loudly rather than silently emit `undefined`). */
export function enumWireName(names: EnumWireNames, ordinal: number): string {
  const name = names.get(ordinal);
  if (name === undefined) {
    throw new Error(`No wire name registered for enum ordinal ${ordinal}`);
  }
  return name;
}

function lowerFirst(value: string): string {
  return value.length === 0 ? value : value[0]!.toLowerCase() + value.slice(1);
}

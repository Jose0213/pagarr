import type { Command } from "./command.js";

/**
 * Ported from NzbDrone.Core/Messaging/Commands/CommandEqualityComparer.cs.
 *
 * C# compares two `Command` instances field-by-field via reflection:
 * different runtime types are never equal; properties named `"Id"` are
 * skipped; properties declared directly on the `Command` base class itself
 * (`Name`, `LastExecutionTime`, `LastStartTime`, `Trigger`,
 * `SuppressMessages`, `ClientUserAgent`, plus the virtual flags) are
 * skipped (`xProperty.DeclaringType == typeof(Command)`) -- only the
 * *subclass's own* properties are compared; `IEnumerable` properties
 * (lists) are compared as sets via `Except` (order-independent, but
 * length-sensitive since `Except` in one direction only catches
 * extra/missing elements -- both directions are checked); everything else
 * uses `.Equals()`.
 *
 * TypeScript has no reflection-based "declared directly on this class vs.
 * inherited" property distinction and no `GetProperties()` equivalent.
 * This port replaces the reflection scan with `Object.keys()` over the
 * command instance's *own enumerable properties* (TS class fields are
 * always own/instance properties, never prototype-inherited data the way
 * C# auto-properties are -- see `command.ts`'s `Command` base, whose own
 * fields (`sendUpdatesToClient`, `lastExecutionTime`, etc.) are plain
 * instance fields too), then explicitly excludes the same `Command`-base
 * field names `CommandEqualityComparer.cs`'s `DeclaringType` check would
 * have skipped. This reproduces the same "only compare the subclass's own
 * declared fields, ignore `Id` and base bookkeeping" behavior without
 * reflection, matching this port's explicit-over-reflection convention.
 *
 * One C# quirk preserved exactly (not "fixed"): the loop's `if (xValue ==
 * null && yValue == null) { return true; }` inside the `foreach` returns
 * `true` from the *whole method* the first time it hits a property where
 * both sides are null -- not just "this property matches, continue to the
 * next one". This means a command whose first compared property happens
 * to be null on both sides is reported equal without checking any further
 * properties, even ones that clearly differ. Ported 1:1 including this bug
 * (see task instructions: "Known bugs get fixed later, separately").
 */
const COMMAND_BASE_FIELDS = new Set<string>([
  "name",
  "lastExecutionTime",
  "lastStartTime",
  "trigger",
  "suppressMessages",
  "clientUserAgent",
  "sendUpdatesToClient",
]);

function ownComparableKeys(command: Command): string[] {
  return Object.keys(command).filter((key) => key !== "id" && !COMMAND_BASE_FIELDS.has(key));
}

function valuesEqual(x: unknown, y: unknown): boolean {
  if (Array.isArray(x) && Array.isArray(y)) {
    // Ported from the `IEnumerable` branch: `Except` both directions,
    // order-independent set comparison over primitive/comparable elements.
    const xNotY = x.filter((xi) => !y.some((yi) => deepEquals(xi, yi)));
    const yNotX = y.filter((yi) => !x.some((xi) => deepEquals(xi, yi)));
    return xNotY.length === 0 && yNotX.length === 0;
  }

  return deepEquals(x, y);
}

/** Ported from `.Equals()` as applied to non-primitive property values (e.g. `ManualImportFile` list elements) -- structural comparison, matching the C# test fixture's expectation that two JSON-cloned object graphs with equal field values compare equal. */
function deepEquals(x: unknown, y: unknown): boolean {
  if (x === y) {
    return true;
  }
  if (typeof x !== "object" || typeof y !== "object" || x === null || y === null) {
    return false;
  }
  return JSON.stringify(x) === JSON.stringify(y);
}

export class CommandEqualityComparer {
  static readonly instance = new CommandEqualityComparer();

  equals(x: Command, y: Command): boolean {
    if (x.constructor !== y.constructor) {
      return false;
    }

    const xKeys = ownComparableKeys(x);

    for (const key of xKeys) {
      const xValue = (x as unknown as Record<string, unknown>)[key];
      const yValue = (y as unknown as Record<string, unknown>)[key];

      // Ported 1:1 from the C# early-return quirk described in this
      // class's doc comment: both-null on ANY compared property returns
      // `true` for the whole comparison, not just that one field.
      if (xValue === null && yValue === null) {
        return true;
      }

      if (xValue === null || yValue === null || xValue === undefined || yValue === undefined) {
        return false;
      }

      if (!valuesEqual(xValue, yValue)) {
        return false;
      }
    }

    return true;
  }
}

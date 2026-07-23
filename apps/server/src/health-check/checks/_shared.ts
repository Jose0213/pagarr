/**
 * Shared helper for the `Checks/` module -- not a direct port of any single
 * C# file. Every real check formats a localized message template via C#'s
 * `string.Format(_localizationService.GetLocalizedString(key), args...)`,
 * where the template contains `{0}`, `{1}`, etc. placeholders. JS has no
 * built-in `string.Format` equivalent; this substitutes positional
 * `{n}` placeholders the same way `string.Format` does.
 */
export function formatMessage(template: string, ...args: unknown[]): string {
  return template.replace(/\{(\d+)\}/g, (match, index: string) => {
    const arg: unknown = args[Number(index)];
    return arg === undefined ? match : stringifyArg(arg);
  });
}

/** Mirrors this port's established `stringifyConfigValue` convention (see `config/configService.ts`) -- avoids `String(x)` silently producing `"[object Object]"` for a non-primitive arg. */
function stringifyArg(value: unknown): string {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return String(value);
  }
  return JSON.stringify(value);
}

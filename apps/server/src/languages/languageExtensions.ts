import type { Language } from "./language.js";

/**
 * Ported from NzbDrone.Core/Languages/LanguageExtensions.cs.
 *
 * C# exposed this as a `static` extension method on `IEnumerable<Language>`
 * (`languages.ToExtendedString()`). TypeScript has no extension methods, so
 * it's ported as a plain function taking the languages as its first
 * argument.
 */
export function toExtendedString(languages: Iterable<Language>): string {
  return Array.from(languages)
    .map((l) => l.name)
    .join(", ");
}

import { getAllLanguages } from "./language.js";
import type { FieldSelectOption } from "./fieldSelectOption.js";

/**
 * Ported from NzbDrone.Core/Languages/LanguageFieldConverter.cs.
 *
 * C# was a DI-registered class with a single `GetSelectOptions()` method
 * (no constructor dependencies, so nothing to inject); ported as a plain
 * function per PORT_PLAN.md's constructor-injection/factory-function
 * guidance -- there's no state or dependency here to justify a class.
 *
 * Used by the `Annotations`-driven UI field system (out of this module's
 * scope -- see `docs/languages/` follow-up once `Annotations`/the field
 * definition system itself is ported in a later phase) to populate a
 * language dropdown's options with every known language, including
 * `Unknown` and `Any`.
 */
export function getLanguageSelectOptions(): FieldSelectOption[] {
  return getAllLanguages().map((v) => ({ value: v.id, name: v.name }));
}

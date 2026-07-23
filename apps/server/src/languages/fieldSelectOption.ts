/**
 * Ported from NzbDrone.Core/Annotations/FieldDefinitionAttribute.cs's
 * `FieldSelectOption` class (the `Annotations` namespace itself hasn't been
 * ported yet -- see PORT_PLAN.md's later phases for the UI field-definition
 * system this belongs to). Only the shape needed by this module's two
 * field-converter functions is ported here; the full attribute/field
 * system moves with `Annotations` when that module is ported.
 *
 * `Order`, `Hint`, and `ParentValue` are part of the real C# class but are
 * never set by `LanguageFieldConverter`/`RealLanguageFieldConverter`
 * (both only populate `Value`/`Name`), so they're included as optional
 * fields for shape-completeness rather than omitted.
 */
export interface FieldSelectOption {
  value: number;
  name: string;
  order?: number;
  hint?: string;
  parentValue?: number;
}

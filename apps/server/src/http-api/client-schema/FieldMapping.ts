import type { Field } from "./Field.js";

/**
 * Ported from Readarr.Http/ClientSchema/FieldMapping.cs.
 *
 * C#'s `FieldMapping` pairs a `Field` (the wire-shape metadata) with a
 * reflection-derived getter/setter closure over a specific settings
 * object's property (`PropertyInfo.GetValue`/`SetValue`). This port has no
 * reflection, so a `FieldMapping<TSettings>` here is built EXPLICITLY by a
 * concrete settings module's own `FieldDefinition<TSettings>[]` array (see
 * SchemaBuilder.ts's `buildFieldSchema`/`readFromFieldSchema`) rather than
 * discovered from decorated properties -- the getter/setter closures are
 * still present and still do the same job (read/write one field's value on
 * a settings instance), just supplied by hand instead of derived via
 * `PropertyInfo`.
 */
export interface FieldMapping<TSettings> {
  field: Field;
  getter: (settings: TSettings) => unknown;
  setter: (settings: TSettings, value: unknown) => void;
}

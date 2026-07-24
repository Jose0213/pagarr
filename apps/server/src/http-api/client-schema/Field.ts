/**
 * Ported from Readarr.Http/ClientSchema/Field.cs and SelectOption.cs.
 *
 * The wire shape the frontend renders a provider settings form from -- one
 * entry per settings-object property. Field names/types here match the C#
 * property names exactly (camelCased, since this port's JSON convention is
 * camelCase throughout -- see e.g. ProviderResource.ts), preserving every
 * slot the real `Field` class carries even where this module's own builder
 * (SchemaBuilder.ts) doesn't yet populate every one (`selectOptionsProviderAction`,
 * `hidden`, `placeholder`, `isFloat` are all pass-through-only until a
 * concrete Phase 5 provider settings module supplies them).
 */
export interface SelectOption {
  value: number;
  name: string;
  order: number;
  hint?: string;
}

/**
 * Ported from Readarr.Http/ClientSchema/Field.cs's `Type` string values
 * (`FieldType` enum, `.ToString().FirstCharToLower()`'d by SchemaBuilder --
 * see that file's real source for the full enum). Kept as a plain string
 * union rather than importing the real `FieldType` enum (not ported here --
 * out of this module's scope, see report) so `buildFieldSchema()` callers
 * can supply any of these without a dependency this module doesn't own.
 */
export type FieldType =
  | "textbox"
  | "number"
  | "checkbox"
  | "password"
  | "hiddenCheckbox"
  | "select"
  | "tagSelect"
  | "tagList"
  | "textArea"
  | "filePath"
  | "path"
  | "device"
  | "url"
  | "oAuth"
  | "keyValueList"
  | "captcha"
  | "docker"
  | "podcast"
  | "informationLink";

export interface Field {
  order: number;
  name: string;
  label?: string;
  unit?: string;
  helpText?: string;
  helpTextWarning?: string;
  helpLink?: string;
  value?: unknown;
  type?: FieldType;
  advanced?: boolean;
  selectOptions?: SelectOption[];
  selectOptionsProviderAction?: string;
  section?: string;
  hidden?: string;
  placeholder?: string;
  isFloat?: boolean;
}

/** Ported from Field.Clone(): a shallow copy (C#'s `MemberwiseClone`). */
export function cloneField(field: Field): Field {
  return { ...field };
}

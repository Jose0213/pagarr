import type { ICustomFormatSpecification } from "../../../custom-formats/specifications/customFormatSpecification.js";
import { RegexSpecificationBase } from "../../../custom-formats/specifications/regexSpecificationBase.js";
import { SizeSpecification } from "../../../custom-formats/specifications/sizeSpecification.js";
import { IndexerFlagSpecification } from "../../../custom-formats/specifications/indexerFlagSpecification.js";
import { ReleaseTitleSpecification } from "../../../custom-formats/specifications/releaseTitleSpecification.js";
import { ReleaseGroupSpecification } from "../../../custom-formats/specifications/releaseGroupSpecification.js";
import type { Field } from "../../client-schema/Field.js";
import {
  buildFieldSchema,
  readFromFieldSchema,
  type FieldDefinition,
} from "../../client-schema/SchemaBuilder.js";
import type { RestResource } from "../../rest/RestResource.js";

/**
 * Ported from Readarr.Api.V1/CustomFormats/CustomFormatSpecificationSchema.cs.
 *
 * ```
 * public class CustomFormatSpecificationSchema : RestResource
 * {
 *     public string Name { get; set; }
 *     public string Implementation { get; set; }
 *     public string ImplementationName { get; set; }
 *     public string InfoLink { get; set; }
 *     public bool Negate { get; set; }
 *     public bool Required { get; set; }
 *     public List<Field> Fields { get; set; }
 *     public List<CustomFormatSpecificationSchema> Presets { get; set; }
 * }
 * ```
 *
 * `ToSchema(this ICustomFormatSpecification model)` uses reflection
 * (`model.GetType().Name` for `Implementation`, `SchemaBuilder.ToSchema(model)`
 * for `Fields`). This port's already-established substitute
 * (`client-schema/SchemaBuilder.ts`'s `FieldDefinition<TSettings>[]`) needs
 * one field-definitions array PER concrete specification class (not a union
 * -- unlike DownloadClient/Notifications, there are only 4 concrete
 * specification classes in this port's scope -- see
 * `custom-formats/specifications/specificationSerializer.ts`'s own
 * `SPECIFICATION_TYPES` registry, the exact same 4-type universe reused
 * here), so a per-type registry (`SPECIFICATION_FIELD_DEFS` below) is
 * feasible and used instead of a generic mapper.
 */

const REGEX_FIELD_DEFS: FieldDefinition<RegexSpecificationBase>[] = [
  {
    name: "value",
    label: "Regular Expression",
    type: "textbox",
    order: 0,
    get: (s) => s.value,
    set: (s, v) => {
      if (v === null || v === undefined) {
        s.value = null;
      } else if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
        s.value = String(v);
      } else {
        s.value = JSON.stringify(v);
      }
    },
  },
];

const SIZE_FIELD_DEFS: FieldDefinition<SizeSpecification>[] = [
  {
    name: "min",
    label: "Minimum Size",
    unit: "GB",
    type: "number",
    order: 0,
    isFloat: true,
    get: (s) => s.min,
    set: (s, v) => {
      s.min = typeof v === "number" ? v : Number(v ?? 0);
    },
  },
  {
    name: "max",
    label: "Maximum Size",
    unit: "GB",
    type: "number",
    order: 1,
    isFloat: true,
    get: (s) => s.max,
    set: (s, v) => {
      s.max = typeof v === "number" ? v : Number(v ?? 0);
    },
  },
];

const INDEXER_FLAG_FIELD_DEFS: FieldDefinition<IndexerFlagSpecification>[] = [
  {
    name: "value",
    label: "Flag",
    type: "select",
    order: 0,
    get: (s) => s.value,
    set: (s, v) => {
      s.value = typeof v === "number" ? v : Number(v ?? 0);
    },
  },
];

type SpecificationTypeName =
  | "ReleaseTitleSpecification"
  | "ReleaseGroupSpecification"
  | "SizeSpecification"
  | "IndexerFlagSpecification";

interface SpecEntry {
  create: () => ICustomFormatSpecification;
  fieldDefs: FieldDefinition<ICustomFormatSpecification>[];
}

/** Ported from `specificationSerializer.ts`'s `SPECIFICATION_TYPES` registry -- the same "explicit registry over reflection" substitute, reused for schema (fields metadata) rather than DB (de)serialization purposes. */
const SPECIFICATION_TYPES: Record<SpecificationTypeName, SpecEntry> = {
  ReleaseTitleSpecification: {
    create: () => new ReleaseTitleSpecification(),
    fieldDefs: REGEX_FIELD_DEFS as unknown as FieldDefinition<ICustomFormatSpecification>[],
  },
  ReleaseGroupSpecification: {
    create: () => new ReleaseGroupSpecification(),
    fieldDefs: REGEX_FIELD_DEFS as unknown as FieldDefinition<ICustomFormatSpecification>[],
  },
  SizeSpecification: {
    create: () => new SizeSpecification(),
    fieldDefs: SIZE_FIELD_DEFS as unknown as FieldDefinition<ICustomFormatSpecification>[],
  },
  IndexerFlagSpecification: {
    create: () => new IndexerFlagSpecification(),
    fieldDefs: INDEXER_FLAG_FIELD_DEFS as unknown as FieldDefinition<ICustomFormatSpecification>[],
  },
};

function implementationNameOf(spec: ICustomFormatSpecification): SpecificationTypeName {
  const ctorName = spec.constructor.name as SpecificationTypeName;
  if (!(ctorName in SPECIFICATION_TYPES)) {
    throw new Error(`Unknown custom format specification implementation: ${ctorName}`);
  }
  return ctorName;
}

export interface CustomFormatSpecificationSchema extends RestResource {
  name: string;
  implementation: string;
  implementationName: string;
  infoLink: string;
  negate: boolean;
  required: boolean;
  fields: Field[];
  presets?: CustomFormatSpecificationSchema[];
}

/** Ported from `CustomFormatSpecificationSchemaMapper.ToSchema`. */
export function specificationToSchema(
  model: ICustomFormatSpecification
): CustomFormatSpecificationSchema {
  const implementation = implementationNameOf(model);
  const entry = SPECIFICATION_TYPES[implementation];

  return {
    id: 0,
    name: model.name,
    implementation,
    implementationName: model.implementationName,
    infoLink: model.infoLink,
    negate: model.negate,
    required: model.required,
    fields: buildFieldSchema(model, entry.fieldDefs),
  };
}

/** Ported from `CustomFormatResourceMapper.MapSpecification`. Throws if `resource.implementation` isn't one of the 4 registered specification types (matches the real C# `ArgumentException` on an unknown implementation). */
export function schemaToSpecification(
  resource: CustomFormatSpecificationSchema
): ICustomFormatSpecification {
  const entry = SPECIFICATION_TYPES[resource.implementation as SpecificationTypeName];
  if (!entry) {
    throw new Error(`${resource.implementation} is not a valid specification implementation`);
  }

  const spec = readFromFieldSchema(resource.fields ?? [], entry.fieldDefs, entry.create);
  spec.name = resource.name;
  spec.negate = resource.negate ?? false;
  spec.required = resource.required ?? false;

  return spec;
}

/** Every registered specification type's default instance, in real C# `_specifications` DI-registration order -- used by `CustomFormatController.ts`'s `GET /schema`. */
export function allSpecificationDefaults(): ICustomFormatSpecification[] {
  return (Object.keys(SPECIFICATION_TYPES) as SpecificationTypeName[]).map((name) =>
    SPECIFICATION_TYPES[name].create()
  );
}

import { IndexerFlagSpecification } from "./indexerFlagSpecification.js";
import { ReleaseGroupSpecification } from "./releaseGroupSpecification.js";
import { ReleaseTitleSpecification } from "./releaseTitleSpecification.js";
import { SizeSpecification } from "./sizeSpecification.js";
import type { ICustomFormatSpecification } from "./customFormatSpecification.js";
import { RegexSpecificationBase } from "./regexSpecificationBase.js";

/**
 * Ported from NzbDrone.Core/Datastore/Converters/CustomFormatSpecificationConverter.cs
 * (`CustomFormatSpecificationListConverter`).
 *
 * C#'s converter serializes `List<ICustomFormatSpecification>` as a JSON
 * array of `{ Type: "<ClassName>", Body: {<serialized fields>} }` wrapper
 * objects, resolving `Type` back to a concrete class via
 * `Type.GetType($"NzbDrone.Core.CustomFormats.{typename}, Readarr.Core")` on
 * read. TS has no runtime reflection/assembly-qualified-name resolution, so
 * `readSpecifications` uses an explicit implementation-name -> constructor
 * registry instead (`SPECIFICATION_TYPES` below) -- the direct equivalent of
 * what that `Type.GetType` call would resolve to for this module's five
 * concrete specification classes (the only ones that exist in the real
 * Readarr book-domain CustomFormats -- see this module's final report).
 *
 * Field naming: C#'s System.Text.Json serializes each concrete class's
 * PascalCase properties (`Name`, `Negate`, `Required`, `Value`/`Min`/`Max`,
 * etc.) as-is inside `Body`. This port stores the same *shape* but with
 * camelCase keys (`name`, `negate`, `required`, `value`/`min`/`max`),
 * matching this codebase's established camelCase-in-JSON-columns convention
 * (see e.g. root-folders' CalibreSettings JSON column) -- an internal
 * storage-format detail, not externally observable behavior, since nothing
 * outside this repository reads the raw column.
 */
type SpecificationTypeName =
  | "ReleaseTitleSpecification"
  | "ReleaseGroupSpecification"
  | "SizeSpecification"
  | "IndexerFlagSpecification";

const SPECIFICATION_TYPES: Record<SpecificationTypeName, () => ICustomFormatSpecification> = {
  ReleaseTitleSpecification: () => new ReleaseTitleSpecification(),
  ReleaseGroupSpecification: () => new ReleaseGroupSpecification(),
  SizeSpecification: () => new SizeSpecification(),
  IndexerFlagSpecification: () => new IndexerFlagSpecification(),
};

function implementationName(spec: ICustomFormatSpecification): SpecificationTypeName {
  const ctorName = spec.constructor.name as SpecificationTypeName;
  if (!(ctorName in SPECIFICATION_TYPES)) {
    throw new Error(`Unknown custom format specification implementation: ${ctorName}`);
  }
  return ctorName;
}

interface SerializedSpecification {
  type: SpecificationTypeName;
  body: {
    name: string;
    negate: boolean;
    required: boolean;
    value?: string | null;
    min?: number;
    max?: number;
  };
}

/** Ported from `CustomFormatSpecificationListConverter.Write`. */
export function writeSpecifications(specs: ICustomFormatSpecification[]): string {
  const wrapped: SerializedSpecification[] = specs.map((spec) => {
    const type = implementationName(spec);
    const body: SerializedSpecification["body"] = {
      name: spec.name,
      negate: spec.negate,
      required: spec.required,
    };

    if (spec instanceof RegexSpecificationBase) {
      body.value = spec.value;
    } else if (spec instanceof SizeSpecification) {
      body.min = spec.min;
      body.max = spec.max;
    } else if (spec instanceof IndexerFlagSpecification) {
      body.value = String(spec.value);
    }

    return { type, body };
  });

  return JSON.stringify(wrapped);
}

/** Ported from `CustomFormatSpecificationListConverter.Read`. */
export function readSpecifications(json: string): ICustomFormatSpecification[] {
  const wrapped = JSON.parse(json) as SerializedSpecification[];

  return wrapped.map(({ type, body }) => {
    const factory = SPECIFICATION_TYPES[type];
    if (!factory) {
      throw new Error(`Unknown custom format specification implementation: ${String(type)}`);
    }

    const spec = factory();
    spec.name = body.name;
    spec.negate = body.negate;
    spec.required = body.required;

    if (spec instanceof RegexSpecificationBase) {
      spec.value = body.value ?? null;
    } else if (spec instanceof SizeSpecification) {
      spec.min = body.min ?? 0;
      spec.max = body.max ?? 0;
    } else if (spec instanceof IndexerFlagSpecification) {
      spec.value = Number(body.value ?? 0);
    }

    return spec;
  });
}

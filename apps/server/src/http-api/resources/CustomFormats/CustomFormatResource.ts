import type { CustomFormat } from "../../../custom-formats/customFormat.js";
import type { ICustomFormatSpecification } from "../../../custom-formats/specifications/customFormatSpecification.js";
import type { RestResource } from "../../rest/RestResource.js";
import {
  schemaToSpecification,
  specificationToSchema,
  type CustomFormatSpecificationSchema,
} from "./CustomFormatSpecificationSchema.js";

/**
 * Ported from Readarr.Api.V1/CustomFormats/CustomFormatResource.cs.
 *
 * ```
 * public class CustomFormatResource : RestResource
 * {
 *     [JsonIgnore(Condition = JsonIgnoreCondition.Never)]
 *     public override int Id { get; set; }
 *     public string Name { get; set; }
 *     public bool? IncludeCustomFormatWhenRenaming { get; set; }
 *     public List<CustomFormatSpecificationSchema> Specifications { get; set; }
 * }
 * ```
 *
 * `[JsonIgnore(Condition = JsonIgnoreCondition.Never)]` on `Id` overrides
 * the base `RestResource.Id`'s `WhenWritingDefault` omission -- a
 * CustomFormat resource ALWAYS includes `"id"` in its JSON, even when 0
 * (unlike every other resource in this port, which uses `stripDefaultId()`
 * -- see `RestResource.ts`'s doc comment). `restController()`
 * (rest/RestController.ts) applies `stripDefaultId()` unconditionally to
 * every response it serializes, with no per-resource opt-out -- ported
 * faithfully here by NOT using `restController()`'s own built-in id
 * stripping for this one resource's id-0 case: `CustomFormatController.ts`
 * re-adds `id: 0` after `stripDefaultId` would have stripped it (see that
 * file's `alwaysIncludeId` helper) rather than modifying the shared,
 * already-merged `restController()` factory for one resource's exception.
 *
 * `includeDetails` (the real mapper's `bool includeDetails` parameter,
 * `true` for `GetResourceById`/`Create`/`Update`/`GetAll` -- the only call
 * path that existed anywhere in `CustomFormatController.cs` when this
 * module was first ported) defaults to `true` here, matching every
 * existing call site in this controller. `includeDetails: false` (only
 * `id`/`name` populated, `includeCustomFormatWhenRenaming`/`specifications`
 * left unset) IS a real branch of the C# mapper, exercised by
 * `Queue/QueueResource.cs`/`History/HistoryResource.cs`/
 * `Blocklist/BlocklistResource.cs`'s own `customFormats?.ToResource(false)`
 * calls -- added back during merge reconciliation once those sibling
 * groups' own narrow `toCustomFormatResource()` forward-ref stand-in
 * (`resources/shared/embeddedResources.ts`) was repointed to call this
 * function directly instead.
 */
export interface CustomFormatResource extends RestResource {
  name: string;
  includeCustomFormatWhenRenaming?: boolean;
  specifications?: CustomFormatSpecificationSchema[];
}

/**
 * Ported from `CustomFormatResourceMapper.ToResource(this CustomFormat
 * model, bool includeDetails)`. `includeDetails` defaults to `true` -- see
 * module doc comment.
 *
 * Overloaded on `includeDetails` so a caller passing `false` (only
 * `id`/`name` ever read, matching the real C# branch) can supply any
 * `Pick<CustomFormat, "id" | "name">`-shaped object -- in particular this
 * port's OTHER, narrower `profiles/customFormat.ts` `CustomFormat`
 * forward-ref stand-in (see that file's own doc comment; a separate,
 * pending reconciliation spanning `decision-engine/**`, out of scope here),
 * which several `includeDetails: false` call sites
 * (`resources/shared/embeddedResources.ts`'s `toCustomFormatResource`)
 * still use as their own `CustomFormat` type. A caller passing `true` (or
 * omitting the argument) must supply the real, full `CustomFormat`, since
 * `includeCustomFormatWhenRenaming`/`specifications` are only ever
 * available on that type.
 */
export function customFormatToResource(
  model: Pick<CustomFormat, "id" | "name">,
  includeDetails: false
): CustomFormatResource;
export function customFormatToResource(
  model: CustomFormat,
  includeDetails?: true
): CustomFormatResource;
export function customFormatToResource(
  model: CustomFormat | Pick<CustomFormat, "id" | "name">,
  includeDetails = true
): CustomFormatResource {
  if (!includeDetails) {
    return { id: model.id, name: model.name };
  }

  const full = model as CustomFormat;
  return {
    id: full.id,
    name: full.name,
    includeCustomFormatWhenRenaming: full.includeCustomFormatWhenRenaming,
    specifications: full.specifications.map(specificationToSchema),
  };
}

/** Ported from `CustomFormatResourceMapper.ToModel(this CustomFormatResource resource, List<ICustomFormatSpecification> specifications)`. The real C# `specifications` parameter (every registered `ICustomFormatSpecification` DI instance, used only to validate `resource.Specifications[i].Implementation` against a known type) is narrowed away -- `schemaToSpecification()` (CustomFormatSpecificationSchema.ts) already owns that exact registry lookup/validation via its own `SPECIFICATION_TYPES`, so there's nothing left for a separate parameter to add here. */
export function customFormatToModel(resource: CustomFormatResource): CustomFormat {
  const specifications: ICustomFormatSpecification[] = (resource.specifications ?? []).map(
    schemaToSpecification
  );

  return {
    id: resource.id,
    name: resource.name,
    includeCustomFormatWhenRenaming: resource.includeCustomFormatWhenRenaming ?? false,
    specifications,
  };
}

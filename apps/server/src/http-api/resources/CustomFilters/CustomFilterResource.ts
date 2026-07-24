import type { RestResource } from "../../rest/RestResource.js";
import type { CustomFilter } from "../../../custom-filters/customFilter.js";

/**
 * Ported from Readarr.Api.V1/CustomFilters/CustomFilterResource.cs.
 *
 * `Filters` is C#'s `List<ExpandoObject>` -- a dynamically-typed list of
 * plain key/value bags (the actual filter predicates the UI built, e.g.
 * `[{ "key": "monitored", "value": true, "type": "equal" }]`), deserialized
 * from the model's raw `Filters` JSON-TEXT column at this exact API-layer
 * boundary (`STJson.Deserialize<List<ExpandoObject>>(model.Filters)`) and
 * re-serialized back to that same TEXT column on write
 * (`STJson.ToJson(resource.Filters)`). TypeScript has no `ExpandoObject`
 * type; `Record<string, unknown>` is the direct structural equivalent (an
 * arbitrary, ad hoc property bag), so `Filters` is ported as
 * `Record<string, unknown>[]`.
 */
export interface CustomFilterResource extends RestResource {
  type: string;
  label: string;
  filters: Record<string, unknown>[];
}

export const CUSTOM_FILTER_RESOURCE_NAME = "customfilter";

/** Ported from `CustomFilterResourceMapper.ToResource(this CustomFilter model)`. */
export function customFilterToResource(model: CustomFilter): CustomFilterResource {
  return {
    id: model.id,
    type: model.type,
    label: model.label,
    filters: JSON.parse(model.filters) as Record<string, unknown>[],
  };
}

/** Ported from `CustomFilterResourceMapper.ToModel(this CustomFilterResource resource)`. */
export function customFilterToModel(resource: CustomFilterResource): CustomFilter {
  return {
    id: resource.id,
    type: resource.type,
    label: resource.label,
    filters: JSON.stringify(resource.filters),
  };
}

/** Ported from `CustomFilterResourceMapper.ToResource(this IEnumerable<CustomFilter> filters)`. */
export function customFiltersToResource(filters: CustomFilter[]): CustomFilterResource[] {
  return filters.map(customFilterToResource);
}

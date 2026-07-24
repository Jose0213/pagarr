import type { RestResource } from "../../rest/RestResource.js";
import type { Tag } from "../../../tags/tag.js";

/**
 * Ported from Readarr.Api.V1/Tags/TagResource.cs.
 *
 * The wire resource for a plain `Tag` -- just `id` + `label`.
 */
export interface TagResource extends RestResource {
  label: string;
}

/** The SignalR broadcast channel / REST wire name for this resource. See RestResource.ts's doc comment on why this is an explicit string, not a reflection-derived one. */
export const TAG_RESOURCE_NAME = "tag";

/** Ported from `TagResourceMapper.ToResource(this Tag model)`. */
export function tagToResource(model: Tag): TagResource {
  return { id: model.id, label: model.label };
}

/** Ported from `TagResourceMapper.ToModel(this TagResource resource)`. */
export function tagToModel(resource: TagResource): Tag {
  return { id: resource.id, label: resource.label };
}

/** Ported from `TagResourceMapper.ToResource(this IEnumerable<Tag> models)`. */
export function tagsToResource(models: Tag[]): TagResource[] {
  return models.map(tagToResource);
}

import type { RestResource } from "../../rest/RestResource.js";
import type { ReleaseProfile } from "../../../profiles/releases/releaseProfile.js";

/** Ported from Readarr.Api.V1/Profiles/Release/ReleaseProfileResource.cs. */
export interface ReleaseProfileResource extends RestResource {
  enabled: boolean;
  required: string[];
  ignored: string[];
  indexerId: number;
  tags: number[];
}

export const RELEASE_PROFILE_RESOURCE_NAME = "releaseprofile";

/** Ported from RestrictionResourceMapper.ToResource(ReleaseProfile). */
export function releaseProfileToResource(model: ReleaseProfile): ReleaseProfileResource {
  return {
    id: model.id,
    enabled: model.enabled,
    required: model.required,
    ignored: model.ignored,
    indexerId: model.indexerId,
    tags: Array.from(model.tags),
  };
}

/** Ported from RestrictionResourceMapper.ToModel(ReleaseProfileResource). */
export function releaseProfileToModel(resource: ReleaseProfileResource): ReleaseProfile {
  return {
    id: resource.id,
    enabled: resource.enabled,
    required: resource.required,
    ignored: resource.ignored,
    indexerId: resource.indexerId,
    tags: new Set(resource.tags),
  };
}

export function releaseProfilesToResources(models: ReleaseProfile[]): ReleaseProfileResource[] {
  return models.map(releaseProfileToResource);
}

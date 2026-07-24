import type { RestResource } from "../../rest/RestResource.js";
import type { MetadataProfile } from "../../../profiles/metadata/metadataProfile.js";

/** Ported from Readarr.Api.V1/Profiles/Metadata/MetadataProfileResource.cs. */
export interface MetadataProfileResource extends RestResource {
  name: string;
  minPopularity: number;
  skipMissingDate: boolean;
  skipMissingIsbn: boolean;
  skipPartsAndSets: boolean;
  skipSeriesSecondary: boolean;
  allowedLanguages: string | null;
  minPages: number;
  ignored: string[];
}

export const METADATA_PROFILE_RESOURCE_NAME = "metadataprofile";

/** Ported from MetadataProfileResourceMapper.ToResource(MetadataProfile). */
export function metadataProfileToResource(model: MetadataProfile): MetadataProfileResource {
  return {
    id: model.id,
    name: model.name,
    minPopularity: model.minPopularity,
    skipMissingDate: model.skipMissingDate,
    skipMissingIsbn: model.skipMissingIsbn,
    skipPartsAndSets: model.skipPartsAndSets,
    skipSeriesSecondary: model.skipSeriesSecondary,
    allowedLanguages: model.allowedLanguages,
    minPages: model.minPages,
    ignored: model.ignored,
  };
}

/** Ported from MetadataProfileResourceMapper.ToModel(MetadataProfileResource). */
export function metadataProfileToModel(resource: MetadataProfileResource): MetadataProfile {
  return {
    id: resource.id,
    name: resource.name,
    minPopularity: resource.minPopularity,
    skipMissingDate: resource.skipMissingDate,
    skipMissingIsbn: resource.skipMissingIsbn,
    skipPartsAndSets: resource.skipPartsAndSets,
    skipSeriesSecondary: resource.skipSeriesSecondary,
    allowedLanguages: resource.allowedLanguages,
    minPages: resource.minPages,
    ignored: resource.ignored,
  };
}

export function metadataProfilesToResources(models: MetadataProfile[]): MetadataProfileResource[] {
  return models.map(metadataProfileToResource);
}

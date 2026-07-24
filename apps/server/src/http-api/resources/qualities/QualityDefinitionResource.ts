import type { RestResource } from "../../rest/RestResource.js";
import type { Quality } from "../../../qualities/quality.js";
import type { QualityDefinition } from "../../../qualities/qualityDefinition.js";

/** Ported from Readarr.Api.V1/Qualities/QualityDefinitionResource.cs. */
export interface QualityDefinitionResource extends RestResource {
  quality: Quality;
  title: string;
  weight: number;
  minSize: number | null;
  maxSize: number | null;
}

export const QUALITY_DEFINITION_RESOURCE_NAME = "qualitydefinition";

/** Ported from QualityDefinitionResourceMapper.ToResource(QualityDefinition). */
export function qualityDefinitionToResource(model: QualityDefinition): QualityDefinitionResource {
  return {
    id: model.id,
    quality: model.quality,
    title: model.title,
    weight: model.weight,
    minSize: model.minSize ?? null,
    maxSize: model.maxSize ?? null,
  };
}

/**
 * Ported from QualityDefinitionResourceMapper.ToModel(QualityDefinitionResource).
 * `GroupName`/`GroupWeight` aren't resource fields (see
 * QualityDefinitionResource.cs -- they're never serialized to/from the
 * wire) and the real C# `ToModel` doesn't set them either, so the mapped
 * model gets their C# default values (`null`/`0`) here too, matching
 * qualityDefinition.ts's own `newQualityDefinition` defaults. This mirrors
 * QualityDefinitionService's own `WithWeight`/`InsertMissingDefinitions`
 * pattern of not trusting a submitted GroupWeight -- it isn't a persisted
 * column at all (see qualityDefinition.ts's doc comment).
 */
export function qualityDefinitionToModel(resource: QualityDefinitionResource): QualityDefinition {
  return {
    id: resource.id,
    quality: resource.quality,
    title: resource.title,
    groupName: null,
    groupWeight: 0,
    weight: resource.weight,
    minSize: resource.minSize,
    maxSize: resource.maxSize,
  };
}

export function qualityDefinitionsToResources(
  models: QualityDefinition[]
): QualityDefinitionResource[] {
  return models.map(qualityDefinitionToResource);
}

export function qualityDefinitionResourcesToModels(
  resources: QualityDefinitionResource[]
): QualityDefinition[] {
  return resources.map(qualityDefinitionToModel);
}

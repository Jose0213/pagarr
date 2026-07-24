import type { RestResource } from "../../rest/RestResource.js";
import type { Quality } from "../../../qualities/quality.js";
import { qualityFromId } from "../../../qualities/quality.js";
import type { QualityProfile } from "../../../profiles/qualities/qualityProfile.js";
import type { QualityProfileQualityItem } from "../../../profiles/qualities/qualityProfileQualityItem.js";
import type { ProfileFormatItem } from "../../../profiles/profileFormatItem.js";
import type { CustomFormat } from "../../../profiles/customFormat.js";

/** Ported from Readarr.Api.V1/Profiles/Quality/QualityProfileResource.cs. */
export interface QualityProfileResource extends RestResource {
  name: string;
  upgradeAllowed: boolean;
  cutoff: number;
  items: QualityProfileQualityItemResource[];
  minFormatScore: number;
  cutoffFormatScore: number;
  formatItems: ProfileFormatItemResource[];
}

/** Ported from QualityProfileQualityItemResource. */
export interface QualityProfileQualityItemResource extends RestResource {
  name: string | null;
  quality: Quality | null;
  items: QualityProfileQualityItemResource[];
  allowed: boolean;
}

/** Ported from ProfileFormatItemResource. */
export interface ProfileFormatItemResource extends RestResource {
  format: number;
  name: string;
  score: number;
}

export const QUALITY_PROFILE_RESOURCE_NAME = "qualityprofile";

/** Ported from ProfileResourceMapper.ToResource(QualityProfileQualityItem). */
export function qualityProfileQualityItemToResource(
  model: QualityProfileQualityItem
): QualityProfileQualityItemResource {
  return {
    id: model.id,
    name: model.name,
    quality: model.quality,
    items: model.items.map(qualityProfileQualityItemToResource),
    allowed: model.allowed,
  };
}

/** Ported from ProfileResourceMapper.ToResource(ProfileFormatItem): `Format = model.Format.Id`. */
export function profileFormatItemToResource(model: ProfileFormatItem): ProfileFormatItemResource {
  return {
    id: 0,
    format: model.format.id,
    name: model.format.name,
    score: model.score,
  };
}

/** Ported from ProfileResourceMapper.ToResource(QualityProfile). */
export function qualityProfileToResource(model: QualityProfile): QualityProfileResource {
  return {
    id: model.id,
    name: model.name,
    upgradeAllowed: model.upgradeAllowed,
    cutoff: model.cutoff,
    items: model.items.map(qualityProfileQualityItemToResource),
    minFormatScore: model.minFormatScore,
    cutoffFormatScore: model.cutoffFormatScore,
    formatItems: model.formatItems.map(profileFormatItemToResource),
  };
}

/**
 * Ported from ProfileResourceMapper.ToModel(QualityProfileQualityItemResource):
 * `Quality = resource.Quality != null ? (Quality)resource.Quality.Id : null`
 * -- the resource's submitted `Quality` object is re-resolved through
 * `qualityFromId` (the explicit-cast port), NOT passed through as-is, so a
 * client-submitted `Quality.name` mismatching the real name for that id is
 * silently corrected -- ported exactly, including that this throws (via
 * `qualityFromId`) if the submitted id doesn't match any known quality.
 */
export function qualityProfileQualityItemToModel(
  resource: QualityProfileQualityItemResource
): QualityProfileQualityItem {
  return {
    id: resource.id,
    name: resource.name,
    quality: resource.quality != null ? qualityFromId(resource.quality.id) : null,
    items: resource.items.map(qualityProfileQualityItemToModel),
    allowed: resource.allowed,
  };
}

/** Ported from ProfileResourceMapper.ToModel(ProfileFormatItemResource): `Format = new CustomFormat { Id = resource.Format }` -- Name is NOT round-tripped (matches the C# source, which never sets it on the model side). */
export function profileFormatItemToModel(resource: ProfileFormatItemResource): ProfileFormatItem {
  const format: CustomFormat = { id: resource.format, name: "" };
  return {
    format,
    score: resource.score,
  };
}

/** Ported from ProfileResourceMapper.ToModel(QualityProfileResource). */
export function qualityProfileToModel(resource: QualityProfileResource): QualityProfile {
  return {
    id: resource.id,
    name: resource.name,
    upgradeAllowed: resource.upgradeAllowed,
    cutoff: resource.cutoff,
    items: resource.items.map(qualityProfileQualityItemToModel),
    minFormatScore: resource.minFormatScore,
    cutoffFormatScore: resource.cutoffFormatScore,
    formatItems: resource.formatItems.map(profileFormatItemToModel),
  };
}

export function qualityProfilesToResources(models: QualityProfile[]): QualityProfileResource[] {
  return models.map(qualityProfileToResource);
}

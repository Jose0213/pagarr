import type { RestResource } from "../../rest/RestResource.js";
import { DownloadProtocol, type DelayProfile } from "../../../profiles/delay/delayProfile.js";

/** Ported from Readarr.Api.V1/Profiles/Delay/DelayProfileResource.cs. */
export interface DelayProfileResource extends RestResource {
  enableUsenet: boolean;
  enableTorrent: boolean;
  preferredProtocol: DownloadProtocol;
  usenetDelay: number;
  torrentDelay: number;
  bypassIfHighestQuality: boolean;
  bypassIfAboveCustomFormatScore: boolean;
  minimumCustomFormatScore: number;
  order: number;
  tags: number[];
}

export const DELAY_PROFILE_RESOURCE_NAME = "delayprofile";

/** Ported from DelayProfileResourceMapper.ToResource(DelayProfile). */
export function delayProfileToResource(model: DelayProfile): DelayProfileResource {
  return {
    id: model.id,
    enableUsenet: model.enableUsenet,
    enableTorrent: model.enableTorrent,
    preferredProtocol: model.preferredProtocol,
    usenetDelay: model.usenetDelay,
    torrentDelay: model.torrentDelay,
    bypassIfHighestQuality: model.bypassIfHighestQuality,
    bypassIfAboveCustomFormatScore: model.bypassIfAboveCustomFormatScore,
    minimumCustomFormatScore: model.minimumCustomFormatScore ?? 0,
    order: model.order,
    tags: Array.from(model.tags),
  };
}

/** Ported from DelayProfileResourceMapper.ToModel(DelayProfileResource). */
export function delayProfileToModel(resource: DelayProfileResource): DelayProfile {
  return {
    id: resource.id,
    enableUsenet: resource.enableUsenet,
    enableTorrent: resource.enableTorrent,
    preferredProtocol: resource.preferredProtocol,
    usenetDelay: resource.usenetDelay,
    torrentDelay: resource.torrentDelay,
    bypassIfHighestQuality: resource.bypassIfHighestQuality,
    bypassIfAboveCustomFormatScore: resource.bypassIfAboveCustomFormatScore,
    minimumCustomFormatScore: resource.minimumCustomFormatScore,
    order: resource.order,
    tags: new Set(resource.tags),
  };
}

export function delayProfilesToResources(models: DelayProfile[]): DelayProfileResource[] {
  return models.map(delayProfileToResource);
}

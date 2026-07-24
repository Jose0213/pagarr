import type { IConfigService } from "../../../config/configService.js";
import type { WriteAudioTagsType, WriteBookTagsType } from "../../../config/enums.js";
import type { RestResource } from "../../rest/RestResource.js";
import { configController } from "./configControllerBase.js";
import type { Router } from "express";

/**
 * Ported from Readarr.Api.V1/Config/{MetadataProviderConfigResource,
 * MetadataProviderConfigController}.cs. Mount path: `/api/v1/config/metadataprovider`.
 */
export interface MetadataProviderConfigResource extends RestResource {
  writeAudioTags: WriteAudioTagsType;
  scrubAudioTags: boolean;
  writeBookTags: WriteBookTagsType;
  updateCovers: boolean;
  embedMetadata: boolean;
}

export function toMetadataProviderConfigResource(
  model: IConfigService
): Omit<MetadataProviderConfigResource, "id"> {
  return {
    writeAudioTags: model.writeAudioTags,
    scrubAudioTags: model.scrubAudioTags,
    writeBookTags: model.writeBookTags,
    updateCovers: model.updateCovers,
    embedMetadata: model.embedMetadata,
  };
}

/** camelCase keys matching `IConfigService`'s own property names -- see DownloadClientConfigResource.ts's doc comment on why this differs from the real C# reflection's PascalCase. */
function toDictionary(resource: MetadataProviderConfigResource): Record<string, unknown> {
  return {
    writeAudioTags: resource.writeAudioTags,
    scrubAudioTags: resource.scrubAudioTags,
    writeBookTags: resource.writeBookTags,
    updateCovers: resource.updateCovers,
    embedMetadata: resource.embedMetadata,
  };
}

export function metadataProviderConfigController(configService: IConfigService): Router {
  return configController<MetadataProviderConfigResource>({
    configService,
    toResource: toMetadataProviderConfigResource,
    toDictionary,
  });
}

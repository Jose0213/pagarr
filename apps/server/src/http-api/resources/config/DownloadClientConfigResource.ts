import type { IConfigService } from "../../../config/configService.js";
import type { RestResource } from "../../rest/RestResource.js";
import { configController } from "./configControllerBase.js";
import type { Router } from "express";

/**
 * Ported from Readarr.Api.V1/Config/{DownloadClientConfigResource,
 * DownloadClientConfigController}.cs. Mount path (per the real
 * `[V1ApiController("config/downloadclient")]`): `/api/v1/config/downloadclient`.
 */
export interface DownloadClientConfigResource extends RestResource {
  downloadClientWorkingFolders: string;
  enableCompletedDownloadHandling: boolean;
  autoRedownloadFailed: boolean;
  autoRedownloadFailedFromInteractiveSearch: boolean;
}

/** Ported from DownloadClientConfigResourceMapper.ToResource(IConfigService). */
export function toDownloadClientConfigResource(
  model: IConfigService
): Omit<DownloadClientConfigResource, "id"> {
  return {
    downloadClientWorkingFolders: model.downloadClientWorkingFolders,
    enableCompletedDownloadHandling: model.enableCompletedDownloadHandling,
    autoRedownloadFailed: model.autoRedownloadFailed,
    autoRedownloadFailedFromInteractiveSearch: model.autoRedownloadFailedFromInteractiveSearch,
  };
}

/**
 * Ported from `resource.GetType().GetProperties(...).ToDictionary(prop =>
 * prop.Name, ...)` -- the real C# reflection produces PascalCase keys
 * (`"Retention"`), but THIS PORT'S `ConfigService.saveConfigDictionary`
 * (config/configService.ts) matches keys against its own `allWithDefaults()`
 * dictionary, which uses the port's native camelCase property names (see
 * that file's own doc comment/`allWithDefaults()` body) -- there is no
 * PascalCase-to-camelCase translation layer anywhere in this port's config
 * stack (unlike C#'s case-insensitive-by-construction property-name
 * dictionary). Every `toDictionary` in this directory therefore emits
 * camelCase keys matching `IConfigService`'s own property names directly,
 * NOT the real C# PascalCase -- verified against a real
 * `ConfigService`/`InMemoryKeyValueRepository` round-trip in this module's
 * test suite (a PascalCase-keyed dictionary silently no-ops, since
 * `allWithDefaults()[key]` reads `undefined` for an unrecognized key and
 * `saveConfigDictionary` skips undefined matches).
 */
function toDictionary(resource: DownloadClientConfigResource): Record<string, unknown> {
  return {
    downloadClientWorkingFolders: resource.downloadClientWorkingFolders,
    enableCompletedDownloadHandling: resource.enableCompletedDownloadHandling,
    autoRedownloadFailed: resource.autoRedownloadFailed,
    autoRedownloadFailedFromInteractiveSearch: resource.autoRedownloadFailedFromInteractiveSearch,
  };
}

export function downloadClientConfigController(configService: IConfigService): Router {
  return configController<DownloadClientConfigResource>({
    configService,
    toResource: toDownloadClientConfigResource,
    toDictionary,
  });
}

import type { RemotePathMapping } from "../../../download-tracking/remote-path-mappings/remotePathMapping.js";
import type { RestResource } from "../../rest/RestResource.js";

/**
 * Ported from Readarr.Api.V1/RemotePathMappings/RemotePathMappingResource.cs.
 *
 * Plain CRUD `RestResource` (not a `ProviderResource` -- no `Fields`/
 * `Implementation`/etc.; a remote path mapping is a bare settings-table row,
 * matching the real C# `RemotePathMappingController : RestController
 * <RemotePathMappingResource>` -- see `RemotePathMappingController.cs`
 * (already confirmed against the real source: no `ProviderControllerBase`
 * involved here at all, unlike DownloadClient/Notifications/Metadata).
 */
export interface RemotePathMappingResource extends RestResource {
  host: string;
  remotePath: string;
  localPath: string;
}

/** Ported from `RemotePathMappingResourceMapper.ToResource`/`ToModel`. */
export function remotePathMappingToResource(model: RemotePathMapping): RemotePathMappingResource {
  return {
    id: model.id,
    host: model.host,
    remotePath: model.remotePath,
    localPath: model.localPath,
  };
}

export function remotePathMappingToModel(resource: RemotePathMappingResource): RemotePathMapping {
  return {
    id: resource.id,
    host: resource.host,
    remotePath: resource.remotePath,
    localPath: resource.localPath,
  };
}

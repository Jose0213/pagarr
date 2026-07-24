import type { RestResource } from "../../rest/RestResource.js";
import type { RootFolder } from "../../../root-folders/root-folder.js";
import { MonitorType, NewItemMonitorType } from "../../../root-folders/root-folder.js";

/**
 * Ported from Readarr.Api.V1/RootFolders/RootFolderResource.cs.
 *
 * `OutputProfile` is C#'s `string` wire representation of the
 * `CalibreProfile` enum (`((CalibreProfile)(...)).ToString()` on the way
 * out, `Enum.Parse(typeof(CalibreProfile), ..., true)` on the way in) --
 * this port's `root-folders/root-folder.ts` doesn't have a ported
 * `CalibreProfile` enum yet (Books.Calibre isn't in scope for RootFolders --
 * see root-folder.ts's own doc comment on the same deviation for
 * `MonitorType`/`NewItemMonitorType`), so `outputProfile` stays the raw
 * numeric ordinal the domain model itself stores
 * (`CalibreSettings.outputProfile: number`) rather than a string enum name.
 * Any future Books/Calibre port that adds the real `CalibreProfile` enum
 * here should also update this resource's `outputProfile` field type and
 * its two conversion functions below to match the real C# string
 * representation -- tracked, not silently dropped.
 */
export interface RootFolderResource extends RestResource {
  name: string | null;
  path: string;
  defaultMetadataProfileId: number;
  defaultQualityProfileId: number;
  defaultMonitorOption: MonitorType;
  defaultNewItemMonitorOption: NewItemMonitorType;
  defaultTags: number[];
  isCalibreLibrary: boolean;
  host: string | null;
  port: number;
  urlBase: string | null;
  username: string | null;
  password: string | null;
  library: string | null;
  outputFormat: string | null;
  /** Raw numeric ordinal -- see interface doc comment. */
  outputProfile: number;
  useSsl: boolean;

  accessible: boolean;
  freeSpace: number | null;
  totalSpace: number | null;
}

export const ROOT_FOLDER_RESOURCE_NAME = "rootfolder";

/** Ported from `RootFolderResourceMapper.ToResource(this RootFolder model)`. */
export function rootFolderToResource(model: RootFolder): RootFolderResource {
  return {
    id: model.id,
    name: model.name,
    path: model.path,
    defaultMetadataProfileId: model.defaultMetadataProfileId,
    defaultQualityProfileId: model.defaultQualityProfileId,
    defaultMonitorOption: model.defaultMonitorOption,
    defaultNewItemMonitorOption: model.defaultNewItemMonitorOption,
    defaultTags: [...model.defaultTags],
    isCalibreLibrary: model.isCalibreLibrary,
    host: model.calibreSettings?.host ?? null,
    port: model.calibreSettings?.port ?? 0,
    urlBase: model.calibreSettings?.urlBase ?? null,
    username: model.calibreSettings?.username ?? null,
    password: model.calibreSettings?.password ?? null,
    library: model.calibreSettings?.library ?? null,
    outputFormat: model.calibreSettings?.outputFormat ?? null,
    outputProfile: model.calibreSettings?.outputProfile ?? 0,
    useSsl: model.calibreSettings?.useSsl ?? false,

    accessible: model.accessible,
    freeSpace: model.freeSpace,
    totalSpace: model.totalSpace,
  };
}

/** Ported from `RootFolderResourceMapper.ToModel(this RootFolderResource resource)`. */
export function rootFolderToModel(resource: RootFolderResource): RootFolder {
  return {
    id: resource.id,
    name: resource.name,
    path: resource.path,
    defaultMetadataProfileId: resource.defaultMetadataProfileId,
    defaultQualityProfileId: resource.defaultQualityProfileId,
    defaultMonitorOption: resource.defaultMonitorOption,
    defaultNewItemMonitorOption: resource.defaultNewItemMonitorOption,
    defaultTags: new Set(resource.defaultTags ?? []),
    isCalibreLibrary: resource.isCalibreLibrary,
    calibreSettings: resource.isCalibreLibrary
      ? {
          host: resource.host,
          port: resource.port,
          urlBase: resource.urlBase,
          username: resource.username,
          password: resource.password,
          library: resource.library,
          outputFormat: resource.outputFormat,
          outputProfile: resource.outputProfile,
          useSsl: resource.useSsl,
        }
      : null,

    // Ported: ToModel doesn't set these (they're read-only/computed-at-read
    // fields -- see root-folder.ts's own doc comment). Defaulted the same
    // way RootFolderService.getDetails leaves them until a disk probe runs.
    accessible: false,
    freeSpace: null,
    totalSpace: null,
  };
}

/** Ported from `RootFolderResourceMapper.ToResource(this IEnumerable<RootFolder> models)`. */
export function rootFoldersToResource(models: RootFolder[]): RootFolderResource[] {
  return models.map(rootFolderToResource);
}

import type { RestResource } from "../../rest/RestResource.js";
import type { DiskSpace } from "../../../disk-space/diskSpace.js";

/**
 * Ported from Readarr.Api.V1/DiskSpace/DiskSpaceResource.cs.
 *
 * The real `DiskSpaceResourceMapper.MapToResource` never sets `Id` --
 * `DiskSpace` (the domain model) has no identity of its own (see
 * disk-space/diskSpace.ts's doc comment), so every `DiskSpaceResource` on
 * the wire has the default `id: 0`, which `RestResource`'s
 * `[JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]`
 * (this port's `stripDefaultId()`, applied automatically by
 * `restController()`) omits from the JSON entirely -- ported faithfully:
 * `diskSpaceToResource` below always sets `id: 0` too.
 */
export interface DiskSpaceResource extends RestResource {
  path: string;
  label: string;
  freeSpace: number;
  totalSpace: number;
}

export const DISK_SPACE_RESOURCE_NAME = "diskspace";

/** Ported from `DiskSpaceResourceMapper.MapToResource(this DiskSpace model)`. */
export function diskSpaceToResource(model: DiskSpace): DiskSpaceResource {
  return {
    id: 0,
    path: model.path,
    label: model.label,
    freeSpace: model.freeSpace,
    totalSpace: model.totalSpace,
  };
}

/** Ported from the mapper's `List<DiskSpace>.ConvertAll(DiskSpaceResourceMapper.MapToResource)` call site in `DiskSpaceController.GetFreeSpace`. */
export function diskSpacesToResource(models: DiskSpace[]): DiskSpaceResource[] {
  return models.map(diskSpaceToResource);
}

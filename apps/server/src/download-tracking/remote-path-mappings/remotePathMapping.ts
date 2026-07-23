import type { ModelBase } from "../../db/model-base.js";

/** Ported from NzbDrone.Core/RemotePathMappings/RemotePathMapping.cs. Backing table: RemotePathMappings (see db/migrations/0001_initial_setup.sql). */
export interface RemotePathMapping extends ModelBase {
  host: string;
  remotePath: string;
  localPath: string;
}

export function newRemotePathMapping(
  overrides: Partial<RemotePathMapping> = {}
): RemotePathMapping {
  return {
    id: 0,
    host: "",
    remotePath: "",
    localPath: "",
    ...overrides,
  };
}

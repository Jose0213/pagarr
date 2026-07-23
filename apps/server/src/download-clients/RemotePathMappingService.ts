import type { OsPath } from "./OsPath.js";

/**
 * Forward-ref for the slice of NzbDrone.Core/RemotePathMappings/
 * RemotePathMappingService.cs this module's clients actually call. The real
 * `RemotePathMappings` module (its own repository/service backed by a
 * `RemotePathMappings` table) is not part of this worktree's scope --
 * `TorrentClientBase`/`UsenetClientBase`/QBittorrent/Sabnzbd only ever call
 * `RemapRemoteToLocal(host, path)`, so that's the only method modeled here.
 * A default no-op implementation (`identityRemotePathMappingService`) is
 * provided below for callers/tests that don't care about remote-path
 * remapping, matching the observable behavior of an empty `RemotePathMappings`
 * table in the real app (`RemapRemoteToLocal` returns its input unchanged
 * when there are no configured mappings).
 */
export interface IRemotePathMappingService {
  remapRemoteToLocal(host: string, remotePath: OsPath): OsPath;
}

export const identityRemotePathMappingService: IRemotePathMappingService = {
  remapRemoteToLocal: (_host: string, remotePath: OsPath): OsPath => remotePath,
};

import type { RemotePathMapping } from "./remotePathMapping.js";
import type { RemotePathMappingRepository } from "./remotePathMappingRepository.js";
import {
  asDirectoryOsPath,
  combineOsPath,
  containsOsPath,
  isEmptyOsPath,
  isRootedOsPath,
  newOsPath,
  subtractOsPath,
  type OsPath,
} from "./osPath.js";

/**
 * Ported from NzbDrone.Core/RemotePathMappings/RemotePathMappingService.cs.
 *
 * DEVIATION -- disk access + caching: C#'s `IDiskProvider.FolderExists` and
 * `ICacheManager.GetCache<List<RemotePathMapping>>(GetType())` (10-second
 * TTL) are both cross-cutting infra modules not owned by this port
 * (Common.Disk / Common.Cache aren't ported anywhere in this codebase yet).
 * `FolderExists` is taken as an injected `folderExists` predicate (default
 * `() => true`, i.e. "assume valid" -- matches this port's established
 * pattern elsewhere for filesystem checks it can't own, e.g.
 * root-folders/root-folder-service.ts's disk-access seam). The 10s TTL
 * cache is reproduced with a small private TTL cache scoped to this service
 * instance (same approach as profiles/delay/delayProfileService.ts's
 * `TtlCache`), preserving `All()`'s externally-visible memoize-then-clear-
 * on-write behavior without depending on `ICacheManager`.
 *
 * `IDownloadClientRepository` is injected into the real C# constructor but
 * never actually used by any method body in RemotePathMappingService.cs --
 * ported here by simply omitting it (an unused constructor parameter has no
 * observable behavior to preserve).
 */

class TtlCache<T> {
  private entry: { value: T; expiresAt: number } | null = null;

  constructor(private readonly ttlMs: number) {}

  get(factory: () => T): T {
    const now = Date.now();
    if (this.entry && this.entry.expiresAt > now) {
      return this.entry.value;
    }
    const value = factory();
    this.entry = { value, expiresAt: now + this.ttlMs };
    return value;
  }

  clear(): void {
    this.entry = null;
  }
}

export interface RemotePathMappingServiceDeps {
  /** Forward-ref for `IDiskProvider.FolderExists` -- see module doc comment. Defaults to always-true ("assume valid"). */
  folderExists?: (path: string) => boolean;
}

export class RemotePathMappingService {
  private readonly cache = new TtlCache<RemotePathMapping[]>(10_000);
  private readonly folderExists: (path: string) => boolean;

  constructor(
    private readonly repository: RemotePathMappingRepository,
    deps: RemotePathMappingServiceDeps = {}
  ) {
    this.folderExists = deps.folderExists ?? (() => true);
  }

  /** Ported from `RemotePathMappingService.All()`: 10s-cached. */
  all(): RemotePathMapping[] {
    return this.cache.get(() => this.repository.all());
  }

  /** Ported from `RemotePathMappingService.Add(RemotePathMapping mapping)`. */
  add(mapping: RemotePathMapping): RemotePathMapping {
    const normalized: RemotePathMapping = {
      ...mapping,
      localPath: asDirectoryOsPath(newOsPath(mapping.localPath)).fullPath,
      remotePath: asDirectoryOsPath(newOsPath(mapping.remotePath)).fullPath,
    };

    const all = this.all();

    this.validateMapping(all, normalized);

    const result = this.repository.insert(normalized);

    this.cache.clear();

    return result;
  }

  /** Ported from `RemotePathMappingService.Remove(int id)`. */
  remove(id: number): void {
    this.repository.delete(id);
    this.cache.clear();
  }

  /** Ported from `RemotePathMappingService.Get(int id)`. */
  get(id: number): RemotePathMapping {
    return this.repository.get(id);
  }

  /** Ported from `RemotePathMappingService.Update(RemotePathMapping mapping)`. */
  update(mapping: RemotePathMapping): RemotePathMapping {
    const existing = this.all().filter((v) => v.id !== mapping.id);

    this.validateMapping(existing, mapping);

    const result = this.repository.update(mapping);

    this.cache.clear();

    return result;
  }

  /** Ported from `RemotePathMappingService.ValidateMapping`. */
  private validateMapping(existing: RemotePathMapping[], mapping: RemotePathMapping): void {
    if (!mapping.host || mapping.host.trim() === "") {
      throw new Error("Invalid Host");
    }

    const remotePath = newOsPath(mapping.remotePath);
    const localPath = newOsPath(mapping.localPath);

    if (isEmptyOsPath(remotePath)) {
      throw new Error("Invalid RemotePath. RemotePath cannot be empty.");
    }

    if (isEmptyOsPath(localPath) || !isRootedOsPath(localPath)) {
      throw new Error("Invalid LocalPath. LocalPath cannot be empty and must not be the root.");
    }

    if (!this.folderExists(localPath.fullPath)) {
      throw new Error("Can't add mount point directory that doesn't exist.");
    }

    if (existing.some((r) => r.host === mapping.host && r.remotePath === mapping.remotePath)) {
      throw new Error("RemotePath already configured.");
    }
  }

  /** Ported from `RemotePathMappingService.RemapRemoteToLocal(string host, OsPath remotePath)`. */
  remapRemoteToLocal(host: string, remotePath: OsPath): OsPath {
    if (isEmptyOsPath(remotePath)) {
      return remotePath;
    }

    const mappings = this.all();

    if (mappings.length === 0) {
      return remotePath;
    }

    for (const mapping of mappings) {
      const mappingRemotePath = newOsPath(mapping.remotePath);
      if (
        host.toLowerCase() === mapping.host.toLowerCase() &&
        containsOsPath(mappingRemotePath, remotePath)
      ) {
        return combineOsPath(
          newOsPath(mapping.localPath),
          subtractOsPath(remotePath, mappingRemotePath)
        );
      }
    }

    return remotePath;
  }

  /** Ported from `RemotePathMappingService.RemapLocalToRemote(string host, OsPath localPath)`. */
  remapLocalToRemote(host: string, localPath: OsPath): OsPath {
    if (isEmptyOsPath(localPath)) {
      return localPath;
    }

    const mappings = this.all();

    if (mappings.length === 0) {
      return localPath;
    }

    for (const mapping of mappings) {
      const mappingLocalPath = newOsPath(mapping.localPath);
      if (
        host.toLowerCase() === mapping.host.toLowerCase() &&
        containsOsPath(mappingLocalPath, localPath)
      ) {
        return combineOsPath(
          newOsPath(mapping.remotePath),
          subtractOsPath(localPath, mappingLocalPath)
        );
      }
    }

    return localPath;
  }
}

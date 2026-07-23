import type { CheckOnEntry } from "../checkOnAttribute.js";
import {
  createHealthCheck,
  createOkHealthCheck,
  HealthCheckResult,
  type HealthCheck,
} from "../healthCheck.js";
import { HealthCheckBase } from "../healthCheckBase.js";
import type { ILocalizationService } from "../localizationService.js";

/**
 * Ported from NzbDrone.Core/HealthCheck/Checks/MountCheck.cs. No `[CheckOn]`
 * attributes on the real C# class -- this check only ever runs on
 * startup/schedule (`checkOnStartup`/`checkOnSchedule` both default `true`
 * via `HealthCheckBase`), same as the real source.
 *
 * FORWARD-REFERENCE: `IDiskProvider.GetMount(path)` returns `IMount`
 * (`NzbDrone.Common.Disk.IMount`: `Name`, `RootDirectory`, `MountOptions.
 * IsReadOnly`, plus several fields this check doesn't read) -- narrowed to
 * exactly those three fields here, field names copied 1:1 from the real C#
 * interface (`IMount`/`MountOptions`) confirmed by reading
 * `NzbDrone.Common/Disk/IMount.cs` + `MountOptions.cs` directly, matching
 * the same "narrow, 1:1-named forward-ref" discipline
 * `media-files-import/mediaFileDiskProvider.ts`'s own `MountLike` (a
 * DIFFERENT narrowing of the same real `IMount`, for a different caller's
 * needs -- see that file's doc comment) already established.
 */
export interface MountLike {
  readonly name: string;
  readonly rootDirectory: string;
  readonly mountOptions: { readonly isReadOnly: boolean } | null;
}

export interface MountCheckDiskProvider {
  getMount(path: string): MountLike | null;
}

export interface MountCheckAuthorService {
  /** Ported from `IAuthorService.AllAuthorPaths()` -- real, `books/authorService.ts`. */
  allAuthorPaths(): Map<number, string>;
}

export const CHECK_ON: CheckOnEntry[] = [];

export class MountCheck extends HealthCheckBase {
  constructor(
    private readonly diskProvider: MountCheckDiskProvider,
    private readonly authorService: MountCheckAuthorService,
    localizationService: ILocalizationService
  ) {
    super(localizationService);
  }

  check(): HealthCheck {
    // Not best for optimization but due to possible symlinks and junctions, we get mounts based on series path so internals can handle mount resolution.
    const seenRootDirectories = new Set<string>();
    const mounts: MountLike[] = [];

    for (const path of this.authorService.allAuthorPaths().values()) {
      const mount = this.diskProvider.getMount(path);
      if (!mount || !mount.mountOptions?.isReadOnly) {
        continue;
      }
      if (seenRootDirectories.has(mount.rootDirectory)) {
        continue;
      }
      seenRootDirectories.add(mount.rootDirectory);
      mounts.push(mount);
    }

    if (mounts.length > 0) {
      return createHealthCheck(
        MountCheck,
        HealthCheckResult.Error,
        this.localizationService.getLocalizedString("MountCheckMessage") +
          mounts.map((m) => m.name).join(", "),
        "#author-mount-ro"
      );
    }

    return createOkHealthCheck(MountCheck);
  }
}

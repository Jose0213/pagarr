import { tmpdir } from "node:os";
import { join } from "node:path";
import type { IHousekeepingDiskProvider } from "../diskProvider.js";
import type { IHousekeepingTask } from "../iHousekeepingTask.js";

/**
 * FORWARD-REF -- narrow stand-in for NzbDrone.Common/EnvironmentInfo/IAppFolderInfo.cs's
 * `TempFolder` property, the only part of `IAppFolderInfo` this task needs.
 *
 * `Update` (NzbDrone.Core/Update, 20 files -- the self-update mechanism) is
 * explicitly out of scope for this port (PORT_PLAN.md: "Explicitly skipped
 * ... Update (20 files) -- self-update mechanism, not applicable to a
 * self-hosted single-container app with its own deploy/update story"), and
 * `IAppFolderInfo` itself (NzbDrone.Common/EnvironmentInfo) is lower-level
 * platform-info infrastructure that no ported module has needed yet. This
 * task's C# original (`CleanupTemporaryUpdateFiles`) still faithfully
 * exists and still needs *a* temp folder concept to know what to delete, so
 * rather than skip the task entirely, `tempFolder` is satisfied by Node's
 * `os.tmpdir()` (the direct equivalent of C#'s `Path.GetTempPath()`, which
 * is exactly what the real `AppFolderInfo` constructor assigns
 * `TempFolder` from -- see AppFolderInfo.cs: `TempFolder =
 * Path.GetTempPath();`).
 */
export interface AppFolderInfoLike {
  tempFolder: string;
}

export const defaultAppFolderInfo: AppFolderInfoLike = {
  tempFolder: tmpdir(),
};

/**
 * Ported from NzbDrone.Common/Extensions/PathExtensions.cs's
 * `GetUpdateSandboxFolder(this IAppFolderInfo appFolderInfo)`:
 * `Path.Combine(appFolderInfo.TempFolder, "readarr_update" +
 * Path.DirectorySeparatorChar)`. The trailing separator baked into the C#
 * constant is absorbed by `Path.Combine`'s own normalization there; `join`
 * here produces the equivalent single-trailing-separator-free path.
 */
function getUpdateSandboxFolder(appFolderInfo: AppFolderInfoLike): string {
  return join(appFolderInfo.tempFolder, "readarr_update");
}

/**
 * Ported from NzbDrone.Core/Housekeeping/Housekeepers/CleanupTemporaryUpdateFiles.cs.
 *
 * Deletes the update sandbox folder (recursively) if it exists. See
 * `AppFolderInfoLike`'s doc comment above for why `IAppFolderInfo` is a
 * narrow forward-ref here rather than a real port.
 */
export class CleanupTemporaryUpdateFiles implements IHousekeepingTask {
  constructor(
    private readonly diskProvider: IHousekeepingDiskProvider,
    private readonly appFolderInfo: AppFolderInfoLike = defaultAppFolderInfo
  ) {}

  clean(): void {
    const updateSandboxFolder = getUpdateSandboxFolder(this.appFolderInfo);

    if (this.diskProvider.folderExists(updateSandboxFolder)) {
      this.diskProvider.deleteFolder(updateSandboxFolder, true);
    }
  }
}

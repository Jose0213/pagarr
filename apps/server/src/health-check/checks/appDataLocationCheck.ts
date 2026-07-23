import { isParentPath, pathEquals } from "../../root-folders/path-utils.js";
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
 * Ported from NzbDrone.Core/HealthCheck/Checks/AppDataLocationCheck.cs.
 *
 * FORWARD-REFERENCE: `IAppFolderInfo` (`NzbDrone.Common.EnvironmentInfo`,
 * `StartUpFolder`/`AppDataFolder`) has not been ported by any prior phase --
 * same gap `instrumentation/deleteLogFilesService.ts`'s doc comment already
 * documents and resolves the same way: the two resolved folder paths are
 * passed in directly rather than reaching for an unported abstraction.
 * `IsParentPath`/`PathEquals` are reused directly from
 * `root-folders/path-utils.ts` (the real port of the same
 * `NzbDrone.Common.Extensions.PathExtensions` methods this check's C#
 * source calls).
 */
export interface AppDataLocationCheckFolders {
  /** Ported from `IAppFolderInfo.StartUpFolder`. */
  readonly startUpFolder: string;
  /** Ported from `IAppFolderInfo.AppDataFolder`. */
  readonly appDataFolder: string;
}

export const CHECK_ON: CheckOnEntry[] = [];

export class AppDataLocationCheck extends HealthCheckBase {
  constructor(
    private readonly appFolderInfo: AppDataLocationCheckFolders,
    localizationService: ILocalizationService
  ) {
    super(localizationService);
  }

  check(): HealthCheck {
    if (
      isParentPath(this.appFolderInfo.startUpFolder, this.appFolderInfo.appDataFolder) ||
      pathEquals(this.appFolderInfo.startUpFolder, this.appFolderInfo.appDataFolder)
    ) {
      return createHealthCheck(
        AppDataLocationCheck,
        HealthCheckResult.Warning,
        this.localizationService.getLocalizedString("AppDataLocationHealthCheckMessage"),
        "#updating-will-not-be-possible-to-prevent-deleting-appdata-on-update"
      );
    }

    return createOkHealthCheck(AppDataLocationCheck);
  }
}

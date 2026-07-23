import { join } from "node:path";
import type { UpdateMechanism } from "../../config/enums.js";
import type { CheckOnEntry } from "../checkOnAttribute.js";
import {
  createHealthCheck,
  createOkHealthCheck,
  HealthCheckResult,
  type HealthCheck,
} from "../healthCheck.js";
import { HealthCheckBase } from "../healthCheckBase.js";
import type { ILocalizationService } from "../localizationService.js";
import { formatMessage } from "./_shared.js";

/**
 * Ported from NzbDrone.Core/HealthCheck/Checks/UpdateCheck.cs.
 *
 * PORT_PLAN.md explicitly marks the whole `Update` module (20 files) as
 * skipped ("self-update mechanism, not applicable to a self-hosted
 * single-container app with its own deploy/update story") -- but this
 * individual check file is one of HealthCheck's real 37 files and is
 * ported faithfully per this task's brief regardless (a self-hoster running
 * outside Docker, e.g. via a plain systemd unit, still benefits from being
 * warned that a startup folder isn't writable). `ICheckUpdateService.
 * AvailableUpdate()` -- the one genuinely `Update`-module-specific
 * dependency -- is narrowed to a minimal `{ availableUpdate(): unknown |
 * null }` forward-ref; a caller not wiring a real update-check service
 * passes one that always returns `null`, which reproduces this port's
 * environment exactly (no self-update mechanism exists, so "is an update
 * available" is trivially always "no").
 *
 * `[CheckOn(typeof(ConfigFileSavedEvent))]` NOT reproduced -- same
 * `ConfigSavedEvent`-not-a-real-event gap `apiKeyValidationCheck.ts`'s doc
 * comment documents, except this one is `ConfigFileSavedEvent`
 * specifically (`config/configFileProvider.ts`'s `onConfigFileSaved`
 * callback stand-in -- same situation, still just a plain callback, not a
 * real `IEvent`).
 *
 * `IAppFolderInfo.StartUpFolder` -- same forward-reference
 * `appDataLocationCheck.ts` already resolves (pass the resolved path in
 * directly). `startupFolder.GetAncestorFolders().Contains("AppTranslocation")`
 * (macOS Gatekeeper's App Translocation quarantine mechanism, which
 * relocates an app bundle to a randomized read-only path) is ported via a
 * plain path-segment scan, since Node has no ancestor-folder-list utility
 * built in.
 */
export const CHECK_ON: CheckOnEntry[] = [];

/** Minimal `ICheckUpdateService` surface this check needs. See module doc comment. */
export interface CheckUpdateServiceLike {
  /** Ported from `ICheckUpdateService.AvailableUpdate()`. Returns `null` when no update is available (the update mechanism's own logic decides "available" -- this port simply never has one to offer, since Update is out of scope; see module doc comment). */
  availableUpdate(): unknown;
}

/** Minimal config surface this check needs -- matches `config/configFileProvider.ts`'s real getters. */
export interface UpdateCheckConfig {
  readonly updateAutomatically: boolean;
  readonly updateMechanism: UpdateMechanism;
}

export interface OsInfoLike {
  readonly isDocker: boolean;
}

export interface UpdateCheckDiskProvider {
  folderWritable(path: string): Promise<boolean> | boolean;
}

/**
 * Ported from `BuildInfo.BuildDateTime` -- a compile-time-stamped build
 * timestamp Readarr's real build pipeline injects, checked against "was
 * this build produced more than 14 days ago" to decide whether it's even
 * worth telling the user an update exists (a brand-new build shouldn't nag
 * about updates immediately). No ported equivalent exists (same
 * `BuildInfo`/environment-info gap `serverSideNotificationService.ts`'s doc
 * comment documents) -- passed in explicitly as an ISO-8601 timestamp
 * string, defaulting to the current process start time (`Date.now()` at
 * module load) as the closest available proxy when a caller doesn't supply
 * a real build timestamp.
 */
const DEFAULT_BUILD_DATE_TIME_MS = Date.now();

export class UpdateCheck extends HealthCheckBase {
  constructor(
    private readonly diskProvider: UpdateCheckDiskProvider,
    private readonly startUpFolder: string,
    private readonly checkUpdateService: CheckUpdateServiceLike,
    private readonly configFileProvider: UpdateCheckConfig,
    private readonly osInfo: OsInfoLike,
    localizationService: ILocalizationService,
    private readonly buildDateTimeMs: number = DEFAULT_BUILD_DATE_TIME_MS
  ) {
    super(localizationService);
  }

  async check(): Promise<HealthCheck> {
    const startupFolder = this.startUpFolder;
    const uiFolder = join(startupFolder, "UI");

    if (
      this.configFileProvider.updateAutomatically &&
      this.configFileProvider.updateMechanism === "BuiltIn" &&
      !this.osInfo.isDocker
    ) {
      if (
        process.platform === "darwin" &&
        getAncestorFolders(startupFolder).includes("AppTranslocation")
      ) {
        return createHealthCheck(
          UpdateCheck,
          HealthCheckResult.Error,
          formatMessage(
            this.localizationService.getLocalizedString("UpdateCheckStartupTranslocationMessage"),
            startupFolder
          ),
          "#cannot-install-update-because-startup-folder-is-in-an-app-translocation-folder."
        );
      }

      if (!(await this.diskProvider.folderWritable(startupFolder))) {
        return createHealthCheck(
          UpdateCheck,
          HealthCheckResult.Error,
          formatMessage(
            this.localizationService.getLocalizedString("UpdateCheckStartupNotWritableMessage"),
            startupFolder,
            currentUserName()
          ),
          "#cannot-install-update-because-startup-folder-is-not-writable-by-the-user"
        );
      }

      if (!(await this.diskProvider.folderWritable(uiFolder))) {
        return createHealthCheck(
          UpdateCheck,
          HealthCheckResult.Error,
          formatMessage(
            this.localizationService.getLocalizedString("UpdateCheckUINotWritableMessage"),
            uiFolder,
            currentUserName()
          ),
          "#cannot-install-update-because-ui-folder-is-not-writable-by-the-user"
        );
      }
    }

    if (
      this.buildDateTimeMs < Date.now() - 14 * 24 * 60 * 60 * 1000 &&
      this.checkUpdateService.availableUpdate() !== null
    ) {
      return createHealthCheck(
        UpdateCheck,
        HealthCheckResult.Warning,
        this.localizationService.getLocalizedString("UpdateAvailable"),
        "#new-update-is-available"
      );
    }

    return createOkHealthCheck(UpdateCheck);
  }
}

/** Ported from `Environment.UserName`. */
function currentUserName(): string {
  return process.env["USERNAME"] ?? process.env["USER"] ?? "";
}

/** Ported from `PathExtensions.GetAncestorFolders` -- the list of path segments from root down to (excluding) the final component. */
function getAncestorFolders(path: string): string[] {
  return path.split(/[/\\]+/).filter((segment) => segment.length > 0);
}

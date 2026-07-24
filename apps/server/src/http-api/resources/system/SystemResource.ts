import type { ConfigFileProvider } from "../../../config/configFileProvider.js";
import type { AuthenticationType } from "../../../config/enums.js";
import type { IDatabase } from "../../../db/database.js";
import type { RestResource } from "../../rest/RestResource.js";

/**
 * Ported from Readarr.Api.V1/System/SystemResource.cs. Not a REST-resource
 * DTO in the base-`RestController<T>` sense (the real C# `SystemResource`
 * does NOT extend `RestResource` -- `SystemController` is a plain MVC
 * `Controller`, not a `RestController<T>` subclass, and `GetStatus()`
 * returns this shape directly at `GET /api/v1/system/status`), but declared
 * `extends RestResource` here anyway purely so `id` has a slot for this
 * port's uniform JSON-response convention; the real resource has no `Id`
 * property at all and this port's `id` is always omitted from the wire
 * payload the same way (see below -- `getSystemStatus` never sets it).
 *
 * ## Forward-referenced fields (this port has no real source for these yet)
 *
 * `NzbDrone.Common.EnvironmentInfo.{BuildInfo,IRuntimeInfo,IPlatformInfo,
 * IOsInfo}` and `NzbDrone.Core.Configuration.IDeploymentInfoProvider` have
 * NO real port anywhere in this codebase yet (verified: `grep`-searched the
 * full `apps/server/src` tree for each -- only doc-comment MENTIONS of them
 * exist, e.g. `lifecycle/lifecycleService.ts`'s narrow `RuntimeInfoLike`,
 * `health-check/healthCheckService.ts`'s "Clock seam" comment,
 * `config/configFileProvider.ts`'s own doc comment explicitly deferring
 * `DeploymentInfoProvider`). Each is narrowed to exactly the fields this
 * one route reads, matching the established "define the seam, wire the
 * real thing later" convention used throughout this port (see
 * `lifecycle/lifecycleService.ts`'s `RuntimeInfoLike`/`ServiceControllerLike`
 * for the canonical precedent this mirrors). `IMainDatabase`/
 * `ILifecycleService` ARE real, already-merged modules (`db/database.ts`'s
 * `IDatabase` -- `MainDatabase` from `db/db-factory.ts` satisfies it
 * directly; `lifecycle/lifecycleService.ts`'s `ILifecycleService`) and are
 * used as-is, not forward-refs.
 */
export interface BuildInfoLike {
  appName: string;
  version: string;
  /** ISO-8601 timestamp string (C# `DateTime`). */
  buildTime: string;
  isDebug: boolean;
}

export interface RuntimeInfoLike {
  isAdmin: boolean;
  /** Ported from `RuntimeInfo.IsUserInteractive` (static: `Environment.UserInteractive`). */
  isUserInteractive: boolean;
  /** Ported from the static `RuntimeInfo.IsProduction` (an official build outside the test environment) -- NOT the same concept as Node's `NODE_ENV`, though a caller's real implementation will likely derive it similarly. */
  isProduction: boolean;
  /** ISO-8601 timestamp string (C# `DateTime`). */
  startTime: string;
  /** Ported from `RuntimeMode` (NzbDrone.Common.EnvironmentInfo) -- kept as a plain string (e.g. "Console"/"Service"/"Tray") rather than a numeric enum, matching this port's string-literal-union convention for small C# enums (see config/enums.ts's doc comment). */
  mode: string;
}

export interface PlatformInfoLike {
  /** C# `Version` (e.g. "8.0.1") stringified -- this port has no `System.Version` equivalent, so this is already the display string. */
  version: string;
}

export interface OsInfoLike {
  name: string;
  version: string;
  isDocker: boolean;
}

export interface DeploymentInfoProviderLike {
  packageVersion: string | null;
  packageAuthor: string | null;
  packageUpdateMechanism: string;
  packageUpdateMechanismMessage: string | null;
}

export interface AppFolderInfoLike {
  startUpFolder: string;
  getAppDataPath(): string;
}

export interface SystemResource extends RestResource {
  appName: string;
  instanceName: string;
  version: string;
  /** ISO-8601 timestamp string (C# `DateTime`). */
  buildTime: string;
  isDebug: boolean;
  isProduction: boolean;
  isAdmin: boolean;
  isUserInteractive: boolean;
  startupPath: string;
  appData: string;
  osName: string;
  osVersion: string;
  isNetCore: boolean;
  isLinux: boolean;
  isOsx: boolean;
  isWindows: boolean;
  isDocker: boolean;
  mode: string;
  branch: string;
  authentication: AuthenticationType;
  databaseType: string;
  databaseVersion: string;
  migrationVersion: number;
  urlBase: string;
  runtimeVersion: string;
  runtimeName: string;
  /** ISO-8601 timestamp string (C# `DateTime`). */
  startTime: string;
  packageVersion: string | null;
  packageAuthor: string | null;
  packageUpdateMechanism: string;
  packageUpdateMechanismMessage: string | null;
}

export interface SystemStatusDeps {
  appFolderInfo: AppFolderInfoLike;
  runtimeInfo: RuntimeInfoLike;
  platformInfo: PlatformInfoLike;
  osInfo: OsInfoLike;
  configFileProvider: ConfigFileProvider;
  database: IDatabase;
  deploymentInfoProvider: DeploymentInfoProviderLike;
  buildInfo: BuildInfoLike;
}

/**
 * Ported from `process.platform`-based OS-family checks -- the direct
 * substitute for `NzbDrone.Common.EnvironmentInfo.OsInfo`'s static
 * `IsLinux`/`IsOsx`/`IsWindows` properties (see
 * validation/paths/pathValidation.ts's own `isWindows()` for the same
 * established convention this mirrors).
 */
function isLinux(): boolean {
  return process.platform === "linux";
}

function isOsx(): boolean {
  return process.platform === "darwin";
}

function isWindows(): boolean {
  return process.platform === "win32";
}

/** Ported from SystemController.GetStatus(). `RuntimeName`/`IsNetCore` are literal constants in the real source too ("netcore"/true) -- not derived from anything Node-specific, preserved verbatim as a faithful naming artifact of the real .NET-hosted app this ports. */
export function getSystemStatus(deps: SystemStatusDeps): SystemResource {
  return {
    id: 0,
    appName: deps.buildInfo.appName,
    instanceName: deps.configFileProvider.instanceName,
    version: deps.buildInfo.version,
    buildTime: deps.buildInfo.buildTime,
    isDebug: deps.buildInfo.isDebug,
    isProduction: deps.runtimeInfo.isProduction,
    isAdmin: deps.runtimeInfo.isAdmin,
    isUserInteractive: deps.runtimeInfo.isUserInteractive,
    startupPath: deps.appFolderInfo.startUpFolder,
    appData: deps.appFolderInfo.getAppDataPath(),
    osName: deps.osInfo.name,
    osVersion: deps.osInfo.version,
    isNetCore: true,
    isLinux: isLinux(),
    isOsx: isOsx(),
    isWindows: isWindows(),
    isDocker: deps.osInfo.isDocker,
    mode: deps.runtimeInfo.mode,
    branch: deps.configFileProvider.branch,
    authentication: deps.configFileProvider.authenticationMethod,
    databaseType: deps.database.databaseType,
    databaseVersion: deps.database.version(),
    migrationVersion: deps.database.migration(),
    urlBase: deps.configFileProvider.urlBase,
    runtimeVersion: deps.platformInfo.version,
    runtimeName: "netcore",
    startTime: deps.runtimeInfo.startTime,
    packageVersion: deps.deploymentInfoProvider.packageVersion,
    packageAuthor: deps.deploymentInfoProvider.packageAuthor,
    packageUpdateMechanism: deps.deploymentInfoProvider.packageUpdateMechanism,
    packageUpdateMechanismMessage: deps.deploymentInfoProvider.packageUpdateMechanismMessage,
  };
}

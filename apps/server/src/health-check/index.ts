/**
 * Barrel export for the HealthCheck module -- port of
 * NzbDrone.Core/HealthCheck/*.cs (the base framework) plus
 * NzbDrone.Core/HealthCheck/Checks/*.cs (26 concrete checks, exported under
 * the `Checks` namespace below). See this worktree's final report for the
 * full list of forward-references (Localization, ImportLists, Notifications,
 * Calibre, environment-info/OsInfo/BuildInfo/AppFolderInfo -- none ported by
 * any prior phase) and the `ModelEvent<T>`/reified-generic-dispatch
 * limitation documented in `checks/calibreRootFolderCheck.ts`'s doc comment.
 */

export * from "./healthCheck.js";
export * from "./iProvideHealthCheck.js";
export * from "./healthCheckBase.js";
export * from "./localizationService.js";
export * from "./checkOnAttribute.js";
export * from "./iCheckOnCondition.js";
export * from "./eventDrivenHealthCheck.js";
export * from "./checkHealthCommand.js";
export * from "./healthCheckCompleteEvent.js";
export * from "./healthCheckFailedEvent.js";
export * from "./serverSideNotificationService.js";
export * from "./healthCheckService.js";

export * as Checks from "./checks/index.js";

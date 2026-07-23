/**
 * Barrel export for the Lifecycle module -- port of
 * NzbDrone.Core/Lifecycle/*.cs (top-level events + LifecycleService, plus
 * the Commands/ subdirectory). See this worktree's final report for the
 * deviations: `RuntimeInfoLike`/`ServiceControllerLike` forward-reference
 * unported `NzbDrone.Common` interfaces (same pattern as
 * `media-files-import/downloadedBooksImportService.ts`'s `RuntimeInfoLike`);
 * `LifecycleService`'s `executeShutdown`/`executeRestart` split its two C#
 * `IExecute<T>` method overloads into two separately-registrable handler
 * objects (see `lifecycleService.ts`'s doc comment).
 */

export * from "./applicationStartingEvent.js";
export * from "./applicationStartedEvent.js";
export * from "./applicationShutdownRequested.js";

export * from "./commands/restartCommand.js";
export * from "./commands/shutdownCommand.js";

export * from "./lifecycleService.js";

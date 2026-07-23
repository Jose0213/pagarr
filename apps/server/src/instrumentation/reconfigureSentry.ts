/**
 * Ported from NzbDrone.Core/Instrumentation/ReconfigureSentry.cs.
 *
 * C#'s `ReconfigureSentry` is a thin `IHandleAsync<ApplicationStartedEvent>`
 * handler: on startup, it looks up the registered NLog `SentryTarget` (from
 * `NzbDrone.Common.Instrumentation.Sentry`, itself an NLog-target
 * integration this port has no equivalent of) and calls `UpdateScope(...)`
 * to attach the DB schema version/migration, release branch, and platform
 * info to Sentry's error-reporting scope.
 *
 * This port has no Sentry SDK dependency and no NLog target to look up
 * (see this module's PR description -- no logging framework is wired in
 * yet, and adding a Sentry dependency is well outside this module's scope
 * of "port the DB-backed log viewer / log cleanup functionality"). There is
 * nothing behaviorally portable here independent of an actual Sentry
 * integration -- unlike ReconfigureLogging's level-resolution math, this
 * class's entire body is "find the Sentry target, call one method on it."
 *
 * `reconfigureSentry()` below is kept as an explicit no-op entry point
 * (rather than omitting the file) so:
 *   1. The 1:1 file mapping from the C# module is visible (11 C# files in,
 *      11 corresponding TS concerns represented here).
 *   2. A future Sentry integration has an obvious, already-named place to
 *      plug `updateScope(...)`-equivalent logic in, matching this handler's
 *      original call site (once on app startup) without needing to
 *      rediscover where that wiring belongs.
 */

/** Ported shape of the fields `SentryTarget.UpdateScope(version, migration, branch, platformInfo)` actually reads. */
export interface SentryScopeInfo {
  databaseVersion: string;
  databaseMigration: number;
  branch: string;
  platformName: string;
  platformVersion: string;
}

/**
 * No-op stand-in for `ReconfigureSentry.Reconfigure()` / `HandleAsync
 * (ApplicationStartedEvent)`. See module doc comment for why: no Sentry SDK
 * or NLog SentryTarget exists in this port to update. Accepts the same
 * scope info the C# source would have forwarded, so a future Sentry
 * integration's call site is a drop-in replacement of this function body.
 */
export function reconfigureSentry(_scope: SentryScopeInfo): void {
  // Intentional no-op -- see module doc comment.
}

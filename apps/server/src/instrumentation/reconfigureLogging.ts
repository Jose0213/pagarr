/**
 * Ported from NzbDrone.Core/Instrumentation/ReconfigureLogging.cs.
 *
 * C#'s `ReconfigureLogging.Reconfigure()` is glue code that pushes
 * `IConfigFileProvider`'s log settings into NLog's live `LogManager.
 * Configuration` object: it walks `LogManager.Configuration.LoggingRules`
 * and flips per-target minimum levels (console/file/trace targets, each
 * addressed by NLog target *name* -- "consoleLogger", "appFileInfo", etc,
 * configured in a NLog.config this port doesn't have), rebuilds the syslog
 * target if a syslog server is configured, sets a static `SqlBuilderExtensions.
 * LogSql` flag, and reconfigures the Sentry target if one is registered.
 * None of that NLog target/rule graph exists in this port (see this
 * module's PR description) -- there is no `LogManager.Configuration` to
 * mutate.
 *
 * What *is* portable and worth keeping is the actual level-resolution
 * logic -- the part of `Reconfigure()` that decides, from config, what the
 * effective minimum log level for the console output should be. That's
 * pure decision logic independent of NLog, and it's what `resolveLogLevels()`
 * below ports. A future real logger integration (whatever this port
 * eventually wires in -- see the "no NLog equivalent" gap noted in this
 * module's PR description) can call this to compute its own minimum
 * levels from `IConfigFileProvider`-shaped config, instead of re-deriving
 * the same branching logic from scratch.
 *
 * Log-level ordering matches NLog's `LogLevel` ordinal ordering (Trace <
 * Debug < Info < Warn < Error < Fatal < Off), which `LogLevel.FromString`
 * and the `>`/`<=` comparisons in the C# source rely on.
 */

export const LOG_LEVELS = ["trace", "debug", "info", "warn", "error", "fatal", "off"] as const;
export type LogLevelName = (typeof LOG_LEVELS)[number];

function ordinal(level: string): number {
  const index = LOG_LEVELS.indexOf(level.toLowerCase() as LogLevelName);
  if (index === -1) {
    throw new Error(`Unknown log level: ${level}`);
  }
  return index;
}

export interface ReconfigureLoggingConfig {
  /** Ported from `IConfigFileProvider.LogLevel`. */
  logLevel: string;
  /** Ported from `IConfigFileProvider.ConsoleLogLevel` (empty string means "not set", matching `IsNotNullOrWhiteSpace()`). */
  consoleLogLevel: string;
}

export interface ResolvedLogLevels {
  minimumLogLevel: LogLevelName;
  minimumConsoleLogLevel: LogLevelName;
}

/**
 * Ported from the level-resolution portion of `ReconfigureLogging.
 * Reconfigure()`:
 *
 *   var minimumLogLevel = LogLevel.FromString(_configFileProvider.LogLevel);
 *   LogLevel minimumConsoleLogLevel;
 *   if (_configFileProvider.ConsoleLogLevel.IsNotNullOrWhiteSpace())
 *       minimumConsoleLogLevel = LogLevel.FromString(_configFileProvider.ConsoleLogLevel);
 *   else if (minimumLogLevel > LogLevel.Info)
 *       minimumConsoleLogLevel = minimumLogLevel;
 *   else
 *       minimumConsoleLogLevel = LogLevel.Info;
 *
 * i.e.: the console defaults to whichever is *less verbose* between "Info"
 * and the configured file log level, unless an explicit console level
 * override is set.
 */
export function resolveLogLevels(config: ReconfigureLoggingConfig): ResolvedLogLevels {
  const minimumLogLevel = config.logLevel.toLowerCase() as LogLevelName;
  ordinal(minimumLogLevel); // validates, matching LogLevel.FromString's throw-on-unknown behavior

  let minimumConsoleLogLevel: LogLevelName;
  if (config.consoleLogLevel.trim() !== "") {
    minimumConsoleLogLevel = config.consoleLogLevel.toLowerCase() as LogLevelName;
    ordinal(minimumConsoleLogLevel);
  } else if (ordinal(minimumLogLevel) > ordinal("info")) {
    minimumConsoleLogLevel = minimumLogLevel;
  } else {
    minimumConsoleLogLevel = "info";
  }

  return { minimumLogLevel, minimumConsoleLogLevel };
}

/**
 * Ported from the per-file-target level gating in `Reconfigure()`:
 *   SetMinimumLogLevel(rules, "appFileInfo", minimumLogLevel <= LogLevel.Info ? LogLevel.Info : LogLevel.Off);
 *   SetMinimumLogLevel(rules, "appFileDebug", minimumLogLevel <= LogLevel.Debug ? LogLevel.Debug : LogLevel.Off);
 *   SetMinimumLogLevel(rules, "appFileTrace", minimumLogLevel <= LogLevel.Trace ? LogLevel.Trace : LogLevel.Off);
 *
 * Readarr's file-based logging split output across three rolling log files
 * of increasing verbosity, each only "on" if the configured level is at or
 * below its own threshold. Returns which of the three would be enabled, for
 * a future file-logging integration to consult -- this port has no file
 * targets to gate today (no NLog.config, no NzbDroneFileTarget), so nothing
 * calls this yet; kept for the same "portable decision logic" reason as
 * `resolveLogLevels()`.
 */
export function resolveFileTargetLevels(minimumLogLevel: LogLevelName): {
  appFileInfo: boolean;
  appFileDebug: boolean;
  appFileTrace: boolean;
} {
  const level = ordinal(minimumLogLevel);
  return {
    appFileInfo: level <= ordinal("info"),
    appFileDebug: level <= ordinal("debug"),
    appFileTrace: level <= ordinal("trace"),
  };
}

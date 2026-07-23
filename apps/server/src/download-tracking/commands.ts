/**
 * Ported from NzbDrone.Core/Download/CheckForFinishedDownloadCommand.cs,
 * ProcessMonitoredDownloadsCommand.cs, RefreshMonitoredDownloadsCommand.cs.
 *
 * C#'s `Command` abstract base (NzbDrone.Core/Messaging/Commands/Command.cs,
 * part of the not-yet-ported Messaging/Jobs modules -- Phase 4) carries
 * scheduler bookkeeping (`Name`, `LastExecutionTime`, `Trigger`,
 * `SendUpdatesToClient`, etc.) and virtual flags each command overrides.
 * These three commands are ported as plain marker classes exposing just the
 * flags each one actually overrides (`requiresDiskAccess`/`isLongRunning`),
 * matching this port's "no DI/scheduler container" convention -- a real
 * command-queue dispatcher (`IManageCommandQueue`, once Messaging/Jobs
 * lands) can wrap these in the full `Command` shape without changing
 * anything here.
 */

/** Ported from NzbDrone.Core/Download/CheckForFinishedDownloadCommand.cs. Deprecated in the C# source itself -- kept for shape fidelity (`DownloadMonitoringService.Execute` still warns and redirects to `Refresh()`, see downloadMonitoringService.ts). */
export class CheckForFinishedDownloadCommand {}

/** Ported from NzbDrone.Core/Download/ProcessMonitoredDownloadsCommand.cs. C# overrides: `RequiresDiskAccess => true`, `IsLongRunning => true`. */
export class ProcessMonitoredDownloadsCommand {
  readonly requiresDiskAccess = true;
  readonly isLongRunning = true;
}

/** Ported from NzbDrone.Core/Download/RefreshMonitoredDownloadsCommand.cs. */
export class RefreshMonitoredDownloadsCommand {}

/**
 * Ported from NzbDrone.Core/Instrumentation/Commands/ClearLogCommand.cs,
 * DeleteLogFilesCommand.cs, DeleteUpdateLogFilesCommand.cs.
 *
 * Same deviation as download-tracking/commands.ts and
 * qualities/commands/resetQualityDefinitionsCommand.ts: C#'s `Command` base
 * class (NzbDrone.Core/Messaging/Commands/Command.cs) is part of the
 * not-yet-ported Messaging/Jobs modules (Phase 4), so these are plain marker
 * classes instead of dispatchable command-bus objects. All three C# classes
 * override only `SendUpdatesToClient => true` (a SignalR/UI hint from the
 * command-bus infrastructure with no equivalent here); there is no other
 * per-command state to carry over, so each marker class is empty.
 *
 * Handlers: ClearLogCommand -> LogService.execute() (logService.ts).
 * DeleteLogFilesCommand / DeleteUpdateLogFilesCommand ->
 * DeleteLogFilesService.execute()/executeUpdate() (deleteLogFilesService.ts).
 */

/** Ported from NzbDrone.Core/Instrumentation/Commands/ClearLogCommand.cs. */
export class ClearLogCommand {}

/** Ported from NzbDrone.Core/Instrumentation/Commands/DeleteLogFilesCommand.cs. */
export class DeleteLogFilesCommand {}

/** Ported from NzbDrone.Core/Instrumentation/Commands/DeleteUpdateLogFilesCommand.cs. */
export class DeleteUpdateLogFilesCommand {}

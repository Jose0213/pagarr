/**
 * Ported from NzbDrone.Core/Messaging/Commands/CommandFailedException.cs.
 *
 * C#'s `NzbDroneException` base supports `string.Format`-style
 * `(message, params object[] args)` constructors -- ported as a single
 * constructor taking an already-formatted message plus an optional cause,
 * matching this port's established convention for `NzbDroneException`
 * subclasses elsewhere (plain `Error` subclasses, no printf-style
 * formatting overload; call sites format the string themselves before
 * throwing). The `(Exception innerException)` single-arg C# overload
 * (defaults message to `"Failed"`) is ported as `cause` defaulting the
 * message when omitted.
 */
export class CommandFailedException extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "CommandFailedException";
  }
}

/** Ported from the C# `CommandFailedException(Exception innerException)` overload: message defaults to "Failed". */
export function commandFailedExceptionFromCause(cause: unknown): CommandFailedException {
  return new CommandFailedException("Failed", { cause });
}

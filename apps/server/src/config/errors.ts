/**
 * Ported from NzbDrone.Core/Configuration/AccessDeniedConfigFileException.cs
 * and InvalidConfigFileException.cs.
 *
 * Simplification (noted per task scope): the C# originals extend
 * `NzbDroneException` (NzbDrone.Common.Exceptions), which itself is a thin
 * wrapper adding little beyond standard .NET Exception behavior (message +
 * inner exception chaining, which `Error`'s `cause` option already covers
 * natively in Node 22+). Rather than port `NzbDroneException` here (it is
 * out of this module's scope -- Exceptions is its own Phase-4 module), these
 * are plain `Error` subclasses with descriptive names, using the standard
 * `ErrorOptions.cause` for the inner-exception chain instead of a bespoke
 * `innerException` field.
 */

export class InvalidConfigFileError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, cause !== undefined ? { cause } : undefined);
    this.name = "InvalidConfigFileError";
  }
}

export class AccessDeniedConfigFileError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, cause !== undefined ? { cause } : undefined);
    this.name = "AccessDeniedConfigFileError";
  }
}

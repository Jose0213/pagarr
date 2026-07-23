/**
 * Ported from NzbDrone.Core/MediaFiles/AzwTag/AzwTagException.cs.
 *
 * C#'s `[Serializable]` attribute + the binary-serialization constructor
 * overload have no meaning in TS/JS (no BinaryFormatter-style serialization
 * in this codebase) and are dropped; the exception's actual behavior --a
 * plain named error type carrying a message-- is preserved via a standard
 * `Error` subclass, this module's usual pattern for ported C# exception
 * types.
 */
export class AzwTagException extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AzwTagException";
  }
}

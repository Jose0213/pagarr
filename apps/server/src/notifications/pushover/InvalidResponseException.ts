/**
 * Ported from NzbDrone.Core/Notifications/Pushover/InvalidResponseException.cs.
 * Plain `Exception` in the real C# (not NzbDroneException) -- ported
 * extending `Error` directly. Renamed from the real C# class's bare
 * `InvalidResponseException` to `PushoverInvalidResponseException` --
 * `telegram/InvalidResponseException.ts` independently ports a
 * same-named-but-distinct C# class from a different namespace
 * (`NzbDrone.Core.Notifications.Telegram.InvalidResponseException`), which
 * collided at this shared module's barrel export. Disambiguated the same
 * way `signal/InvalidResponseException.ts` already disambiguates its own
 * class to `SignalInvalidResponseException` for the identical reason (see
 * that file's doc comment) -- Telegram's was left as-is since it merged
 * first and nothing outside its own module barrel consumes either class
 * (both are "kept for fidelity, unused by any real call site" per their own
 * doc comments).
 */
export class PushoverInvalidResponseException extends Error {
  constructor(message?: string) {
    super(message);
    this.name = "PushoverInvalidResponseException";
    Object.setPrototypeOf(this, PushoverInvalidResponseException.prototype);
  }
}

/**
 * Ported from NzbDrone.Core/Organizer/Exception.cs (`NamingFormatException`,
 * extends the Readarr-wide `NzbDroneException`, which itself just wraps
 * `Exception` with a formatted-message constructor -- no special ported
 * behavior beyond being a distinctly-named error type callers can catch).
 */
export class NamingFormatException extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NamingFormatException";
  }
}

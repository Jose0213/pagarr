/** Ported from NzbDrone.Core/Notifications/Gotify/GotifyException.cs. Extends `NzbDroneException` in the real C# (not ported); ported extending `Error`. */
export class GotifyException extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "GotifyException";
    Object.setPrototypeOf(this, GotifyException.prototype);
  }
}

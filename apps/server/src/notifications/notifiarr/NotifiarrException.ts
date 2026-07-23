/** Ported from NzbDrone.Core/Notifications/Notifiarr/NotifiarrException.cs. Extends `NzbDroneException` in the real C# (not ported); ported extending `Error`. */
export class NotifiarrException extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "NotifiarrException";
    Object.setPrototypeOf(this, NotifiarrException.prototype);
  }
}

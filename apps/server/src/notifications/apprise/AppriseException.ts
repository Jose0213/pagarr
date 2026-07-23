/** Ported from NzbDrone.Core/Notifications/Apprise/AppriseException.cs. Extends `NzbDroneException` in the real C# (not ported); ported extending `Error`. */
export class AppriseException extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "AppriseException";
    Object.setPrototypeOf(this, AppriseException.prototype);
  }
}

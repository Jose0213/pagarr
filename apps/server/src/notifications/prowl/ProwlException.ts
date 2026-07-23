/** Ported from NzbDrone.Core/Notifications/Prowl/ProwlException.cs. Extends `NzbDroneException` in the real C# (not ported); ported extending `Error`. */
export class ProwlException extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ProwlException";
    Object.setPrototypeOf(this, ProwlException.prototype);
  }
}

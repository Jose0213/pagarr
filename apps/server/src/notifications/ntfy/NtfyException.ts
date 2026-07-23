/** Ported from NzbDrone.Core/Notifications/Ntfy/NtfyException.cs. Extends `NzbDroneException` in the real C# (not ported); ported extending `Error`. */
export class NtfyException extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "NtfyException";
    Object.setPrototypeOf(this, NtfyException.prototype);
  }
}

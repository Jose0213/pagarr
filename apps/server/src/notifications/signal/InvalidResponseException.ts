/** Ported from NzbDrone.Core/Notifications/Signal/InvalidResponseException.cs (class name `SignalInvalidResponseException`). Unused by any current call site in the real source -- kept for fidelity. */
export class SignalInvalidResponseException extends Error {
  constructor(message?: string) {
    super(message);
    this.name = "SignalInvalidResponseException";
    Object.setPrototypeOf(this, SignalInvalidResponseException.prototype);
  }
}

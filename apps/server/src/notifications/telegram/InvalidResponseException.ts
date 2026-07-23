/** Ported from NzbDrone.Core/Notifications/Telegram/InvalidResponseException.cs. Unused by any current call site in the real source (kept for fidelity -- see class doc comment on TelegramProxy.ts). */
export class InvalidResponseException extends Error {
  constructor(message?: string) {
    super(message);
    this.name = "InvalidResponseException";
    Object.setPrototypeOf(this, InvalidResponseException.prototype);
  }
}

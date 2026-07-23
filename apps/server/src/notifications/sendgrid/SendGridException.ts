/** Ported from NzbDrone.Core/Notifications/SendGrid/SendGridException.cs. */
export class SendGridException extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SendGridException";
    Object.setPrototypeOf(this, SendGridException.prototype);
  }
}

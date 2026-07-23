/** Ported from NzbDrone.Core/Notifications/Mailgun/MailgunException.cs. */
export class MailgunException extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MailgunException";
    Object.setPrototypeOf(this, MailgunException.prototype);
  }
}

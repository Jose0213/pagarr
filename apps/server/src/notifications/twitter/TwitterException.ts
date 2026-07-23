/** Ported from NzbDrone.Core/Notifications/Twitter/TwitterException.cs. */
export class TwitterException extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "TwitterException";
    Object.setPrototypeOf(this, TwitterException.prototype);
  }
}

/** Ported from NzbDrone.Core/Notifications/PushBullet/PushBulletException.cs. Extends `NzbDroneException` in the real C# (not ported); ported extending `Error`, matching this port's convention elsewhere. */
export class PushBulletException extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "PushBulletException";
    Object.setPrototypeOf(this, PushBulletException.prototype);
  }
}

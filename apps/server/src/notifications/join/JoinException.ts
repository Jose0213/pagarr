/**
 * Ported from NzbDrone.Core/Notifications/Join/{JoinException,
 * JoinAuthException,JoinInvalidDeviceException}.cs. All three extend
 * `NzbDroneException` (NzbDrone.Common.Exceptions, not ported in this
 * worktree) -- ported here extending the plain `Error`, matching this
 * port's convention elsewhere for NzbDroneException-derived exception
 * types (e.g. http/HttpException.ts extends `Error` directly).
 */
export class JoinException extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "JoinException";
    Object.setPrototypeOf(this, JoinException.prototype);
  }
}

/** Ported from NzbDrone.Core/Notifications/Join/JoinAuthException.cs. */
export class JoinAuthException extends JoinException {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "JoinAuthException";
    Object.setPrototypeOf(this, JoinAuthException.prototype);
  }
}

/** Ported from NzbDrone.Core/Notifications/Join/JoinInvalidDeviceException.cs. */
export class JoinInvalidDeviceException extends JoinException {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "JoinInvalidDeviceException";
    Object.setPrototypeOf(this, JoinInvalidDeviceException.prototype);
  }
}

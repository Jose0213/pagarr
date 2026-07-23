/**
 * Ported from NzbDrone.Core/Notifications/Kavita/KavitaException.cs +
 * KavitaAuthenticationException.cs (`: KavitaException`).
 */
export interface KavitaExceptionOptions {
  args?: unknown[];
  cause?: unknown;
}

export class KavitaException extends Error {
  constructor(message: string, options: KavitaExceptionOptions = {}) {
    const { args = [], cause } = options;
    super(args.length > 0 ? formatMessage(message, args) : message, { cause });
    this.name = "KavitaException";
    Object.setPrototypeOf(this, KavitaException.prototype);
  }
}

export class KavitaAuthenticationException extends KavitaException {
  constructor(message: string, options: KavitaExceptionOptions = {}) {
    super(message, options);
    this.name = "KavitaAuthenticationException";
    Object.setPrototypeOf(this, KavitaAuthenticationException.prototype);
  }
}

function formatMessage(message: string, args: unknown[]): string {
  let i = 0;
  return message.replace(/\{\d+\}/g, () => String(args[i++]));
}

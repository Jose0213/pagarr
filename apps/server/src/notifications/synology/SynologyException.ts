/** Ported from NzbDrone.Core/Notifications/Synology/SynologyException.cs. Same `{ args, cause }` options convention as this module's other exception ports. */
export interface SynologyExceptionOptions {
  args?: unknown[];
  cause?: unknown;
}

export class SynologyException extends Error {
  constructor(message: string, options: SynologyExceptionOptions = {}) {
    const { args = [], cause } = options;
    super(args.length > 0 ? formatMessage(message, args) : message, { cause });
    this.name = "SynologyException";
    Object.setPrototypeOf(this, SynologyException.prototype);
  }
}

function formatMessage(message: string, args: unknown[]): string {
  let i = 0;
  return message.replace(/\{\d+\}/g, () => String(args[i++]));
}

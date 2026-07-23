/** Ported from NzbDrone.Core/Indexers/Torznab/TorznabException.cs. */
export class TorznabException extends Error {
  constructor(message: string, ...args: unknown[]) {
    super(args.length > 0 ? formatMessage(message, args) : message);
    this.name = "TorznabException";
    Object.setPrototypeOf(this, TorznabException.prototype);
  }
}

function formatMessage(message: string, args: unknown[]): string {
  let i = 0;
  return message.replace(/\{\d+\}/g, () => String(args[i++]));
}

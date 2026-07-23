/** Ported from NzbDrone.Core/Indexers/Exceptions/SizeParsingException.cs. */
export class SizeParsingException extends Error {
  constructor(message: string, ...args: unknown[]) {
    super(args.length > 0 ? formatMessage(message, args) : message);
    this.name = "SizeParsingException";
    Object.setPrototypeOf(this, SizeParsingException.prototype);
  }
}

function formatMessage(message: string, args: unknown[]): string {
  let i = 0;
  return message.replace(/\{\d+\}/g, () => String(args[i++]));
}

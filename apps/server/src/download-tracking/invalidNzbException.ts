/** Ported from NzbDrone.Core/Download/InvalidNzbException.cs. C#'s `NzbDroneException` base (NzbDrone.Common.Exceptions) supports a `string.Format`-style message + args constructor overload -- ported here as a single constructor that formats eagerly, matching this port's established exception-porting convention (e.g. db/errors.ts's plain-message exceptions). */
export class InvalidNzbException extends Error {
  constructor(message: string, ...args: unknown[]) {
    super(args.length > 0 ? formatMessage(message, args) : message);
    this.name = "InvalidNzbException";
  }
}

function formatMessage(message: string, args: unknown[]): string {
  return args.reduce<string>((acc, arg, i) => acc.replace(`{${i}}`, String(arg)), message);
}

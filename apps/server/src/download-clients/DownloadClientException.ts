/**
 * Ported from NzbDrone.Core/Download/Clients/DownloadClientException.cs +
 * DownloadClientAuthenticationException.cs + DownloadClientUnavailableException.cs
 * (both `: DownloadClientException`), which in turn extend
 * `NzbDrone.Common.Exceptions.NzbDroneException`.
 *
 * C#'s `NzbDroneException` base overloads its constructor by parameter
 * *type* (`params object[] args` for `string.Format` templating vs. a typed
 * `Exception innerException` positional param) -- TS has no overload
 * resolution by runtime type, and guessing which meaning a given argument
 * has (an `Error` vs. a format arg that happens to be an object) is
 * needlessly fragile. This port instead takes an explicit options object:
 * `{ args }` for `string.Format`-style `{0}`/`{1}` templating (same
 * formatter `indexers/torznab/TorznabException.ts` uses), `{ cause }` for
 * the wrapped inner exception (mapped onto the standard `Error.cause`).
 * Call sites in this module's C# (QBittorrentProxyV1/V2's
 * `SetTorrentLabel`/`MoveTorrentToTopInQueue`) inspect
 * `ex.InnerException is HttpException httpException` to special-case
 * specific wrapped HTTP status codes -- `.cause instanceof HttpException` is
 * this port's equivalent inspection point.
 */
export interface DownloadClientExceptionOptions {
  args?: unknown[];
  cause?: unknown;
}

export class DownloadClientException extends Error {
  constructor(message: string, options: DownloadClientExceptionOptions = {}) {
    const { args = [], cause } = options;
    super(args.length > 0 ? formatMessage(message, args) : message, { cause });
    this.name = "DownloadClientException";
    Object.setPrototypeOf(this, DownloadClientException.prototype);
  }
}

export class DownloadClientAuthenticationException extends DownloadClientException {
  constructor(message: string, options: DownloadClientExceptionOptions = {}) {
    super(message, options);
    this.name = "DownloadClientAuthenticationException";
    Object.setPrototypeOf(this, DownloadClientAuthenticationException.prototype);
  }
}

export class DownloadClientUnavailableException extends DownloadClientException {
  constructor(message: string, options: DownloadClientExceptionOptions = {}) {
    super(message, options);
    this.name = "DownloadClientUnavailableException";
    Object.setPrototypeOf(this, DownloadClientUnavailableException.prototype);
  }
}

function formatMessage(message: string, args: unknown[]): string {
  let i = 0;
  return message.replace(/\{\d+\}/g, () => String(args[i++]));
}

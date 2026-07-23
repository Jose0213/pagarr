/**
 * Ported from NzbDrone.Core/Exceptions/DownstreamException.cs.
 *
 * Sibling of `NzbDroneClientException` (both derive from the unported
 * `NzbDroneException` base in the real C# -- see NzbDroneClientException.ts's
 * doc comment) -- NOT a subclass of it, despite both carrying a `statusCode`.
 * Represents a failure that originated from a downstream service (e.g. an
 * indexer or metadata provider returning an error status), as opposed to
 * `NzbDroneClientException` which represents Readarr/Pagarr itself rejecting
 * a request.
 */
export class DownstreamException extends Error {
  readonly statusCode: number;

  constructor(statusCode: number, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "DownstreamException";
    this.statusCode = statusCode;
    Object.setPrototypeOf(this, DownstreamException.prototype);
  }
}

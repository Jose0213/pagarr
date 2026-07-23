/** Ported from NzbDrone.Core/Indexers/Exceptions/RequestLimitReachedException.cs. */
export class RequestLimitReachedException extends Error {
  /** Milliseconds, mirrors the C# TimeSpan RetryAfter (default TimeSpan.Zero -> 0). */
  readonly retryAfter: number;

  constructor(message: string, retryAfter = 0) {
    super(message);
    this.name = "RequestLimitReachedException";
    this.retryAfter = retryAfter;
    Object.setPrototypeOf(this, RequestLimitReachedException.prototype);
  }
}

/**
 * Ported from NzbDrone.Core/Exceptions/NzbDroneClientException.cs.
 *
 * The real C# base class is `NzbDroneException` (NzbDrone.Common/Exceptions/
 * NzbDroneException.cs), an abstract class deriving from `ApplicationException`
 * whose only job is `string.Format(message, args)`-ing a `params object[] args`
 * tail onto the message before handing it to the base `Exception` constructor.
 * `NzbDroneException` isn't ported as its own file/class here -- there's no
 * TS equivalent need for an intermediate abstract class that does nothing but
 * message formatting, and no other Pagarr module has ported it either (see
 * metadata-source/errors.ts, which extends `Error` directly). Every exception
 * in this module extends `Error` (or, for the `ReleaseDownloadException`
 * family, each other) directly instead of through an `NzbDroneException`
 * layer. The `params object[] args` printf-style overloads on every C#
 * constructor are similarly not carried over 1:1 -- TypeScript callers use
 * template literals to build the message string before calling `super()`,
 * so there is no need for a separate "message + args" overload. Callers
 * porting `new XException(foo, "bar {0}", baz)` call sites should port them
 * as `new XException(foo, \`bar ${baz}\`)`.
 */
export class NzbDroneClientException extends Error {
  readonly statusCode: number;

  constructor(statusCode: number, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "NzbDroneClientException";
    this.statusCode = statusCode;
    Object.setPrototypeOf(this, NzbDroneClientException.prototype);
  }
}

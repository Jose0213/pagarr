import { BadRequestException } from "./BadRequestException.js";
import { DownstreamException } from "./DownstreamException.js";

/**
 * Ported from NzbDrone.Core/Exceptions/StatusCodeToExceptions.cs.
 *
 * The real C# is a `VerifyStatusCode(this HttpStatusCode statusCode, string
 * message = null)` extension method, called as `statusCode.VerifyStatusCode()`
 * at call sites. TS has no extension methods, so this is a plain exported
 * function -- call sites port `statusCode.VerifyStatusCode(msg)` to
 * `verifyStatusCode(statusCode, msg)`.
 *
 * Preserves the real switch's exact (and slightly odd) behavior verbatim:
 * only BadRequest (400), Unauthorized (401), PaymentRequired (402), and
 * InternalServerError (500) throw; every other status code -- including
 * common failure codes like 403/404/503 -- silently no-ops. This looks like
 * a deliberately narrow allowlist in the original (most callers only care
 * about a handful of statuses and handle the rest themselves), not a bug,
 * so it's kept as-is rather than "fixed" to cover more codes.
 *
 * `HttpStatusCode.Unauthorized` throws `UnauthorizedAccessException`, a
 * .NET BCL exception with no ported equivalent anywhere in this codebase
 * (not `NzbDroneClientException`, not `DownstreamException` -- the real C#
 * deliberately reaches for a different exception type here, unlike the other
 * three cases which stay within this module's own hierarchy). Ported as a
 * plain `Error` named `"UnauthorizedAccessException"` to preserve that
 * distinction for any `instanceof`/`.name`-based catch-block dispatch a
 * caller might port later, without inventing a new class this module's real
 * C# source doesn't have.
 */
export function verifyStatusCode(statusCode: number, message?: string | null): void {
  const resolvedMessage = message == null || message === "" ? String(statusCode) : message;

  switch (statusCode) {
    case 400:
      throw new BadRequestException(resolvedMessage);

    case 401: {
      const error = new Error(resolvedMessage);
      error.name = "UnauthorizedAccessException";
      throw error;
    }

    case 402:
      throw new DownstreamException(statusCode, resolvedMessage);

    case 500:
      throw new DownstreamException(statusCode, resolvedMessage);

    default:
      return;
  }
}

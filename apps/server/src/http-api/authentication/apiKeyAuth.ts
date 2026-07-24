import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { ConfigFileProvider } from "../../config/configFileProvider.js";
import { isCgnatIpAddress, isLocalAddress } from "./ipAddressExtensions.js";

/**
 * Ported from Readarr.Http/Authentication/ApiKeyAuthenticationHandler.cs
 * (API-key check) + Authentication/UiAuthorizationHandler.cs (the
 * `AuthenticationRequiredType.DisabledForLocalAddresses` bypass) +
 * Authentication/NoAuthenticationHandler.cs (the `AuthenticationType.None`
 * bypass).
 *
 * ## Why these three C# handlers become one middleware
 *
 * ASP.NET wires `ApiKeyAuthenticationHandler`/`BasicAuthenticationHandler`/
 * `NoAuthenticationHandler` as swappable `AuthenticationScheme`s selected by
 * a policy provider, with `UiAuthorizationHandler` layered on top as a
 * separate `IAuthorizationHandler` deciding whether the chosen scheme's
 * result is even required for a given request (the `DisabledForLocalAddresses`
 * bypass). Express has no scheme-provider/policy-handler split -- this port
 * collapses that combination into a single `apiKeyAuthMiddleware()` Express
 * middleware whose net *behavior*, per request, is identical to what the
 * combination produces for the API-key path specifically:
 *
 *   1. If `configFileProvider.authenticationRequired ===
 *      "DisabledForLocalAddresses"` and the request's remote address is
 *      local (or CGNAT and `trustCgnatIpAddresses` is on), skip
 *      authentication entirely and call `next()` -- ported from
 *      `UiAuthorizationHandler.HandleRequirementAsync`'s
 *      `context.Succeed(requirement)` bypass.
 *   2. Otherwise, parse the API key from (in this exact order, matching
 *      `ApiKeyAuthenticationHandler.ParseApiKey`): the `apikey` query
 *      param, then the `X-Api-Key` header, then an `Authorization: Bearer
 *      <key>` header (`.Replace("Bearer ", "")` -- ported literally as a
 *      prefix strip, not a case-insensitive/whitespace-tolerant parse,
 *      matching the real source's exact string replace).
 *   3. Compare against `configFileProvider.apiKey`. Match -> `next()`.
 *      No match / missing -> 401 (ported from
 *      `ApiKeyAuthenticationHandler.HandleChallengeAsync`'s
 *      `Response.StatusCode = 401`), body-less (the real handler writes no
 *      response body on challenge either).
 *
 * `AuthenticationType.None`/`NoAuthenticationHandler`'s "everyone is
 * Anonymous, always succeeds" behavior is NOT folded into this specific
 * middleware -- see `createAuthMiddleware()` below, which is the actual
 * composition root export deciding whether to mount `apiKeyAuthMiddleware`
 * at all based on `authenticationMethod`.
 *
 * ## Basic auth (UI login) is explicitly out of scope here
 *
 * Per this task's brief: `BasicAuthenticationHandler`'s job (validating a
 * username/password against `IAuthenticationService`/`UserService` for the
 * browser UI's own login flow, distinct from `/api/v1/*` API-key auth) is
 * NOT implemented in this pass -- documented, not built. A future pass
 * wiring up the frontend's login page is the natural place to port it,
 * using the already-ported `authentication/UserService.ts`
 * (`apps/server/src/authentication/UserService.ts`, confirmed present) as
 * its credential-check backend, the same dependency the real
 * `BasicAuthenticationHandler` took (`IAuthenticationService.Login(...)`).
 */

const API_KEY_QUERY_PARAM = "apikey";
const API_KEY_HEADER = "x-api-key";

/** Ported from ApiKeyAuthenticationHandler.ParseApiKey(). */
function parseApiKey(req: Request): string | undefined {
  const queryValue = req.query[API_KEY_QUERY_PARAM];
  if (typeof queryValue === "string" && queryValue.length > 0) {
    return queryValue;
  }

  const headerValue = req.headers[API_KEY_HEADER];
  if (typeof headerValue === "string" && headerValue.length > 0) {
    return headerValue;
  }
  if (Array.isArray(headerValue) && headerValue.length > 0) {
    return headerValue[0];
  }

  const authHeader = req.headers.authorization;
  if (typeof authHeader === "string") {
    // Ported literally: `.Replace("Bearer ", "")` -- a plain prefix strip,
    // not a case-insensitive or whitespace-tolerant Bearer-scheme parse.
    return authHeader.replace("Bearer ", "");
  }

  return undefined;
}

/** Ported from UiAuthorizationHandler.HandleRequirementAsync's DisabledForLocalAddresses bypass. */
function isBypassedForLocalAddress(req: Request, configFileProvider: ConfigFileProvider): boolean {
  if (configFileProvider.authenticationRequired !== "DisabledForLocalAddresses") {
    return false;
  }

  const remoteAddress = req.ip ?? req.socket.remoteAddress;

  if (isLocalAddress(remoteAddress)) {
    return true;
  }

  return configFileProvider.trustCgnatIpAddresses && isCgnatIpAddress(remoteAddress);
}

/**
 * Ported from ApiKeyAuthenticationHandler's core check, combined with
 * UiAuthorizationHandler's local-address bypass -- see module doc comment.
 * This middleware alone does NOT consult `authenticationMethod` (whether
 * auth is enabled at all) -- that decision belongs to the composition root
 * (`createAuthMiddleware`), which only mounts this middleware when API-key
 * auth applies.
 */
export function apiKeyAuthMiddleware(configFileProvider: ConfigFileProvider): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (isBypassedForLocalAddress(req, configFileProvider)) {
      next();
      return;
    }

    const providedApiKey = parseApiKey(req);

    if (!providedApiKey || !providedApiKey.trim()) {
      res.status(401).end();
      return;
    }

    if (providedApiKey === configFileProvider.apiKey) {
      next();
      return;
    }

    res.status(401).end();
  };
}

/**
 * Ported from the composition-level decision every request's authentication
 * scheme selection ultimately reduces to for this port's scope (API-key
 * auth on `/api/v1/*`-shaped routes; see module doc comment for what's
 * deliberately not covered): `AuthenticationType.None` -> never check;
 * anything else -> run `apiKeyAuthMiddleware` (which itself still honors
 * the `DisabledForLocalAddresses` bypass regardless of method, matching the
 * real source's `UiAuthorizationHandler` applying to every scheme
 * uniformly).
 */
export function createAuthMiddleware(configFileProvider: ConfigFileProvider): RequestHandler {
  const apiKeyMiddleware = apiKeyAuthMiddleware(configFileProvider);

  return (req: Request, res: Response, next: NextFunction): void => {
    if (configFileProvider.authenticationMethod === "None") {
      next();
      return;
    }

    apiKeyMiddleware(req, res, next);
  };
}

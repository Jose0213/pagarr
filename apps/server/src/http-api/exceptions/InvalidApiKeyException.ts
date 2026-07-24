/**
 * Ported from Readarr.Http/Exceptions/InvalidApiKeyException.cs.
 *
 * Not currently thrown anywhere in this module -- the real C# usage site
 * (`ApiKeyAuthenticationHandler`) returns `AuthenticateResult.NoResult()`
 * on a bad key rather than throwing this, exactly as ported in
 * authentication/apiKeyAuth.ts. Kept as a 1:1 faithful port of the class
 * itself (a plain `Error` subclass with no special behavior) since it's a
 * small, self-contained type real Readarr code elsewhere is free to throw,
 * and a later Phase 5 controller may have a legitimate use for it.
 */
export class InvalidApiKeyException extends Error {
  constructor(message?: string) {
    super(message);
    this.name = "InvalidApiKeyException";
    Object.setPrototypeOf(this, InvalidApiKeyException.prototype);
  }
}

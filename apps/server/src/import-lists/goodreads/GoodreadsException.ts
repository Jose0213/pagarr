/**
 * Ported from NzbDrone.Core/ImportLists/Goodreads/GoodreadsException.cs.
 */
export class GoodreadsException extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "GoodreadsException";
    Object.setPrototypeOf(this, GoodreadsException.prototype);
  }
}

export class GoodreadsAuthorizationException extends GoodreadsException {
  constructor(message: string) {
    super(message);
    this.name = "GoodreadsAuthorizationException";
    Object.setPrototypeOf(this, GoodreadsAuthorizationException.prototype);
  }
}

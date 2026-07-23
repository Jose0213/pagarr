/** Ported from NzbDrone.Core/Indexers/Exceptions/ApiKeyException.cs. */
export class ApiKeyException extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApiKeyException";
    Object.setPrototypeOf(this, ApiKeyException.prototype);
  }
}

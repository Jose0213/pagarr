/** Ported from NzbDrone.Core/Indexers/Exceptions/UnsupportedFeedException.cs. */
export class UnsupportedFeedException extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsupportedFeedException";
    Object.setPrototypeOf(this, UnsupportedFeedException.prototype);
  }
}

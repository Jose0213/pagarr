import { IndexerException } from "../exceptions/IndexerException.js";
import type { IndexerResponse } from "../IndexerResponse.js";

/** Ported from NzbDrone.Core/Indexers/Newznab/NewznabException.cs. */
export class NewznabException extends IndexerException {
  constructor(response: IndexerResponse, message: string, ...args: unknown[]) {
    super(response, message, ...args);
    this.name = "NewznabException";
    Object.setPrototypeOf(this, NewznabException.prototype);
  }
}

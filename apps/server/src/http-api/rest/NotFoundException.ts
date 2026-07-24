import { ApiException } from "../exceptions/ApiException.js";

/** Ported from Readarr.Http/REST/NotFoundException.cs. Fixed at HTTP 404. */
export class NotFoundException extends ApiException {
  constructor(content?: unknown) {
    super(404, content);
    this.name = "NotFoundException";
    Object.setPrototypeOf(this, NotFoundException.prototype);
  }
}

import { ApiException } from "../exceptions/ApiException.js";

/** Ported from Readarr.Http/REST/MethodNotAllowedException.cs. Fixed at HTTP 405. */
export class MethodNotAllowedException extends ApiException {
  constructor(content?: unknown) {
    super(405, content);
    this.name = "MethodNotAllowedException";
    Object.setPrototypeOf(this, MethodNotAllowedException.prototype);
  }
}

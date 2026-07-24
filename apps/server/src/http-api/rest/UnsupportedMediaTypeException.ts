import { ApiException } from "../exceptions/ApiException.js";

/** Ported from Readarr.Http/REST/UnsupportedMediaTypeException.cs. Fixed at HTTP 415. */
export class UnsupportedMediaTypeException extends ApiException {
  constructor(content?: unknown) {
    super(415, content);
    this.name = "UnsupportedMediaTypeException";
    Object.setPrototypeOf(this, UnsupportedMediaTypeException.prototype);
  }
}

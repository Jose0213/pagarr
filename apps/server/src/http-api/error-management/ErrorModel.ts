import type { Response } from "express";
import type { ApiException } from "../exceptions/ApiException.js";

/**
 * Ported from Readarr.Http/ErrorManagement/ErrorModel.cs.
 *
 * C#'s `WriteToResponse` sets the status code, content type, and
 * `System.Text.Json`-serializes itself directly to the response body
 * stream. This port's `writeToResponse` does the Express equivalent
 * (`res.status(...).type("application/json").json(...)`).
 */
export class ErrorModel {
  message?: string;
  description?: string;
  content?: unknown;

  constructor(exception?: ApiException) {
    if (exception) {
      this.message = exception.message;
      this.content = exception.content;
    }
  }

  /** Ported from ErrorModel.WriteToResponse(HttpResponse, HttpStatusCode). Default status matches the C# default parameter (`HttpStatusCode.InternalServerError` = 500). */
  writeToResponse(res: Response, statusCode = 500): void {
    res.status(statusCode).type("application/json").json(this);
  }
}

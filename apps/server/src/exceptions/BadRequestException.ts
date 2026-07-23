import { DownstreamException } from "./DownstreamException.js";

/**
 * Ported from NzbDrone.Core/Exceptions/BadRequestException.cs.
 *
 * Fixed at `statusCode = 400` (C# `HttpStatusCode.BadRequest`), hence no
 * `statusCode` constructor parameter -- matches the real C# class, which only
 * ever passes `HttpStatusCode.BadRequest` up to its `DownstreamException`
 * base.
 */
export class BadRequestException extends DownstreamException {
  constructor(message: string, options?: { cause?: unknown }) {
    super(400, message, options);
    this.name = "BadRequestException";
    Object.setPrototypeOf(this, BadRequestException.prototype);
  }
}

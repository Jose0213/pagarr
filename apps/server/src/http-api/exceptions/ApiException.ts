/**
 * Ported from Readarr.Http/Exceptions/ApiException.cs.
 *
 * NOTE on naming/location: this is `Readarr.Http.Exceptions.ApiException`,
 * NOT `NzbDrone.Core.Exceptions.NzbDroneClientException`
 * (`apps/server/src/exceptions/NzbDroneClientException.ts`, already ported
 * in Phase 4 Wave 1) -- the two are separate C# class hierarchies that
 * happen to share the "carries an HTTP status code" shape. `ApiException`
 * lives in the HTTP layer specifically for REST-controller-thrown errors
 * (`BadRequestException`/`NotFoundException`/etc. below); `NzbDroneClientException`
 * is a core-domain exception family thrown by business logic far from any
 * HTTP concern. Both are mapped to HTTP responses by the error pipeline
 * (error-management/ReadarrErrorPipeline.ts), but kept as distinct classes
 * here exactly as they are in the real C# source (see that file's own doc
 * comment for why it isn't merged into this one).
 *
 * `content` carries arbitrary extra error detail (matches C#'s
 * `object Content`), serialized into `ErrorModel.content` by the error
 * pipeline.
 */
export abstract class ApiException extends Error {
  readonly statusCode: number;
  readonly content: unknown;

  protected constructor(statusCode: number, content?: unknown, options?: { cause?: unknown }) {
    super(ApiException.buildMessage(statusCode, content), options);
    this.name = "ApiException";
    this.statusCode = statusCode;
    this.content = content;
    Object.setPrototypeOf(this, ApiException.prototype);
  }

  /** Ported from ApiException.GetMessage(HttpStatusCode, object): `"{StatusCode}: {content}"`, or just the status code text if content is unset. */
  private static buildMessage(statusCode: number, content: unknown): string {
    const statusText = String(statusCode);

    if (content !== undefined && content !== null) {
      const contentText = typeof content === "string" ? content : JSON.stringify(content);
      return `${statusText}: ${contentText}`;
    }

    return statusText;
  }
}

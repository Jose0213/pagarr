// Ported from:
//  - NzbDrone.Common/Http/HttpException.cs
//  - NzbDrone.Common/Http/TooManyRequestsException.cs
//  - NzbDrone.Common/Http/UnexpectedHtmlContentException.cs
//
// TlsFailureException.cs is NOT ported: it wraps a .NET WebException /
// SecureChannelFailure status that has no fetch() equivalent -- undici
// surfaces TLS failures as a generic TypeError with a `cause`, so there's
// nothing distinct to model. Callers that care can inspect `cause` on the
// raw fetch rejection themselves.

import type { HttpRequest } from "./HttpRequest.js";
import type { HttpResponse } from "./HttpResponse.js";

export class HttpException extends Error {
  readonly request: HttpRequest;
  readonly response: HttpResponse;

  constructor(request: HttpRequest, response: HttpResponse, message?: string) {
    super(
      message ??
        `HTTP request failed: [${response.statusCode}:${HttpException.statusText(response.statusCode)}] [${request.method}] at [${request.url.toString()}]`
    );
    this.name = "HttpException";
    this.request = request;
    this.response = response;

    Object.setPrototypeOf(this, HttpException.prototype);
  }

  private static statusText(code: number): string {
    return String(code);
  }

  override toString(): string {
    if (this.response?.responseData != null) {
      return `${super.toString()}\n${this.response.content}`;
    }

    return super.toString();
  }
}

export class TooManyRequestsException extends HttpException {
  readonly retryAfter: number | null;

  constructor(request: HttpRequest, response: HttpResponse) {
    super(request, response);
    this.name = "TooManyRequestsException";

    let retryAfter: number | null = null;

    if (response.headers.containsKey("Retry-After")) {
      const retryAfterHeader = response.headers.get("Retry-After");
      if (retryAfterHeader !== null) {
        const seconds = Number.parseInt(retryAfterHeader, 10);
        if (!Number.isNaN(seconds) && String(seconds) === retryAfterHeader.trim()) {
          retryAfter = seconds * 1000;
        } else {
          const date = new Date(retryAfterHeader);
          if (!Number.isNaN(date.getTime())) {
            retryAfter = date.getTime() - Date.now();
          }
        }
      }
    }

    this.retryAfter = retryAfter;
    Object.setPrototypeOf(this, TooManyRequestsException.prototype);
  }
}

export class UnexpectedHtmlContentException extends HttpException {
  constructor(response: HttpResponse) {
    super(
      response.request,
      response,
      `Site responded with browser content instead of api data. This disruption may be temporary, please try again later. [${response.request.url.toString()}]`
    );
    this.name = "UnexpectedHtmlContentException";
    Object.setPrototypeOf(this, UnexpectedHtmlContentException.prototype);
  }
}

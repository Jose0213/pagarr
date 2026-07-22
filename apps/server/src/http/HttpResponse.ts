// Ported from NzbDrone.Common/Http/HttpResponse.cs

import { HttpHeader } from "./HttpHeader.js";
import type { HttpRequest } from "./HttpRequest.js";

const SET_COOKIE_RE = /^(.*?)=(.*?)(?:;|$)/;

// Statuses Readarr treats as "redirect" for its manual redirect-follow loop.
const REDIRECT_STATUS_CODES = new Set([301, 302, 303, 307, 308]);

export class HttpResponse {
  readonly request: HttpRequest;
  readonly headers: HttpHeader;
  readonly statusCode: number;
  /** HTTP version string, e.g. "1.1" or "2.0" (System.Version equivalent). */
  readonly version: string | null;
  readonly responseData: Uint8Array | null;

  private _content: string | null = null;

  constructor(
    request: HttpRequest,
    headers: HttpHeader,
    body: Uint8Array | string | null,
    statusCode = 200,
    version: string | null = null
  ) {
    this.request = request;
    this.headers = headers;
    this.statusCode = statusCode;
    this.version = version;

    if (typeof body === "string") {
      this.responseData = Buffer.from(body, headers.getEncodingFromContentType() as BufferEncoding);
      this._content = body;
    } else {
      this.responseData = body;
    }
  }

  get content(): string {
    if (this._content === null) {
      const encoding = this.headers.getEncodingFromContentType();
      this._content = this.responseData
        ? Buffer.from(this.responseData).toString(encoding as BufferEncoding)
        : "";
    }

    return this._content;
  }

  get hasHttpError(): boolean {
    return this.statusCode >= 400;
  }

  get hasHttpServerError(): boolean {
    return this.statusCode >= 500;
  }

  get hasHttpRedirect(): boolean {
    return REDIRECT_STATUS_CODES.has(this.statusCode);
  }

  getCookieHeaders(): string[] {
    return this.headers.getValues("Set-Cookie") ?? [];
  }

  getCookies(): Map<string, string> {
    const result = new Map<string, string>();

    for (const cookie of this.getCookieHeaders()) {
      const match = SET_COOKIE_RE.exec(cookie);
      if (match) {
        result.set(match[1]!, match[2]!);
      }
    }

    return result;
  }

  toString(): string {
    let result = `Res: HTTP/${this.version} [${this.request.method}] ${this.request.url.toString()}: ${this.statusCode} (${this.responseData?.length ?? 0} bytes)`;

    const contentType = this.headers.contentType;
    if (this.hasHttpError && isNotNullOrWhiteSpace(contentType) && contentType.toLowerCase() !== "text/html") {
      result += "\n" + this.content;
    }

    return result;
  }
}

/**
 * Mirrors NzbDrone.Common.Http.HttpResponse<T>: a response with the body
 * eagerly JSON-deserialized into T. The C# constraint `where T : new()`
 * doesn't have a TS equivalent; callers just supply the type parameter.
 */
export class TypedHttpResponse<T> extends HttpResponse {
  readonly resource: T;

  constructor(response: HttpResponse) {
    super(response.request, response.headers, response.responseData, response.statusCode, response.version);
    this.resource = JSON.parse(response.content) as T;
  }
}

function isNotNullOrWhiteSpace(value: string | null | undefined): value is string {
  return value !== null && value !== undefined && value.trim() !== "";
}

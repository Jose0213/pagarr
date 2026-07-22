// Ported from NzbDrone.Common/Http/HttpRequest.cs

import { HttpHeader } from "./HttpHeader.js";
import type { HttpAccept } from "./HttpAccept.js";
import { HttpUri } from "./HttpUri.js";
import type { HttpCredential } from "./HttpCredential.js";

export type HttpMethod = "GET" | "POST" | "PUT" | "DELETE" | "HEAD" | "PATCH" | "OPTIONS";

export interface HttpRequestOptions {
  httpAccept?: HttpAccept;
  /**
   * Readarr's ctor defaults AllowAutoRedirect=true, then forces it to false
   * outside of RuntimeInfo.IsProduction (dev builds don't want silent
   * redirects masking a stale request URL). We surface that same knob as
   * `isProduction` so callers/tests can exercise both branches; defaults to
   * true (production) to match real deployed behavior.
   */
  isProduction?: boolean;
}

/**
 * Mirrors NzbDrone.Common.Http.HttpRequest: a plain data object describing
 * an outgoing request. Built directly or via HttpRequestBuilder.
 */
export class HttpRequest {
  url: HttpUri;
  method: HttpMethod = "GET";
  headers: HttpHeader;
  contentData: Uint8Array | null = null;
  contentSummary: string | null = null;
  credentials: HttpCredential | null = null;
  suppressHttpError = false;
  suppressHttpErrorStatusCodes: number[] | null = null;
  useSimplifiedUserAgent = false;
  allowAutoRedirect: boolean;
  connectionKeepAlive = true;
  logResponseContent = false;
  logHttpError = true;
  cookies = new Map<string, string | null>();
  storeRequestCookie = true;
  storeResponseCookie = false;
  /** Milliseconds. 0 (falsy) means "use the dispatcher default", matching TimeSpan.Zero. */
  requestTimeout = 0;
  /** Milliseconds. 0 means no rate limiting, matching TimeSpan.Zero. */
  rateLimit = 0;
  rateLimitKey: string | null = null;
  /** Node writable stream to pipe the response body into (DownloadFile use case). */
  responseStream: NodeJS.WritableStream | null = null;

  constructor(url: string, options: HttpRequestOptions = {}) {
    this.url = new HttpUri(url);
    this.headers = new HttpHeader();
    this.allowAutoRedirect = options.isProduction ?? true;

    if (options.httpAccept) {
      this.headers.accept = options.httpAccept.value;
    }
  }

  toString(includeMethod = true, includeSummary = true): string {
    let result = "";

    if (includeMethod) {
      result += `Req: [${this.method}] `;
    }

    result += this.url.toString();

    if (includeSummary && isNotNullOrWhiteSpace(this.contentSummary)) {
      result += ": " + this.contentSummary;
    }

    return result;
  }

  setContent(data: Uint8Array | string): void {
    if (typeof data === "string") {
      const encoding = HttpHeader.getEncodingFromContentType(this.headers.contentType ?? "");
      this.contentData = new TextEncoder().encode(data);
      // Encoding is almost always utf-8 for our use cases; if a non-utf8
      // charset is ever set, re-encode via Buffer which knows more labels.
      if (encoding !== "utf-8" && encoding !== "utf8") {
        this.contentData = new Uint8Array(Buffer.from(data, encoding as BufferEncoding));
      }
    } else {
      this.contentData = data;
    }
  }
}

function isNotNullOrWhiteSpace(value: string | null | undefined): value is string {
  return value !== null && value !== undefined && value.trim() !== "";
}

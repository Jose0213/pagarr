// Ported from NzbDrone.Common/Http/HttpClient.cs

import { HttpUri } from "./HttpUri.js";
import { HttpRequest } from "./HttpRequest.js";
import { HttpResponse, TypedHttpResponse } from "./HttpResponse.js";
import {
  HttpException,
  TooManyRequestsException,
  UnexpectedHtmlContentException,
} from "./HttpException.js";
import { CookieJar } from "./CookieJar.js";
import type { IHttpRequestInterceptor } from "./IHttpRequestInterceptor.js";
import type { IHttpDispatcher } from "./dispatchers/IHttpDispatcher.js";
import type { IRateLimitService } from "./RateLimitService.js";

const MAX_REDIRECTS = 5;

export interface HttpLogger {
  trace(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

const noopLogger: HttpLogger = {
  trace: () => {},
  warn: () => {},
  error: () => {},
};

export interface IHttpClient {
  execute(request: HttpRequest): Promise<HttpResponse>;
  downloadFile(url: string, fileName: string): Promise<void>;
  get(request: HttpRequest): Promise<HttpResponse>;
  getTyped<T>(request: HttpRequest): Promise<TypedHttpResponse<T>>;
  head(request: HttpRequest): Promise<HttpResponse>;
  post(request: HttpRequest): Promise<HttpResponse>;
  postTyped<T>(request: HttpRequest): Promise<TypedHttpResponse<T>>;
}

/**
 * Mirrors NzbDrone.Common.Http.HttpClient. Method-name adaptations from the
 * C#:
 *  - Get<T>/Post<T> generic overloads become getTyped/postTyped (TS can't
 *    overload get()/get<T>() the way C# overloads by return type + generic
 *    arity).
 *  - The sync Execute/Get/Post/Head wrappers around *Async in the C# (via
 *    GetAwaiter().GetResult()) are dropped entirely -- Node has no
 *    synchronous-block-on-a-promise primitive, so only the async surface
 *    is ported. All callers in a Node port are async anyway.
 */
export class HttpClient implements IHttpClient {
  private readonly requestInterceptors: IHttpRequestInterceptor[];
  private readonly rateLimitService: IRateLimitService;
  private readonly httpDispatcher: IHttpDispatcher;
  private readonly logger: HttpLogger;

  /** Persistent cross-request cookie jar, mirrors the C#'s ICached<CookieContainer> keyed "container". */
  private readonly persistentCookieJar = new CookieJar();

  constructor(
    requestInterceptors: IHttpRequestInterceptor[],
    rateLimitService: IRateLimitService,
    httpDispatcher: IHttpDispatcher,
    logger: HttpLogger = noopLogger
  ) {
    this.requestInterceptors = [...requestInterceptors];
    this.rateLimitService = rateLimitService;
    this.httpDispatcher = httpDispatcher;
    this.logger = logger;
  }

  async execute(request: HttpRequest): Promise<HttpResponse> {
    const cookieJar = this.initializeRequestCookies(request);

    let response = await this.executeRequest(request, cookieJar);

    if (request.allowAutoRedirect && response.hasHttpRedirect) {
      const autoRedirectChain = [request.url.toString()];

      do {
        const location = response.headers.getSingleValue("Location");
        request.url = HttpUri.combine(request.url, new HttpUri(location ?? ""));
        autoRedirectChain.push(request.url.toString());

        this.logger.trace("Redirected to %s", request.url.toString());

        if (autoRedirectChain.length > MAX_REDIRECTS) {
          throw new Error(
            `Too many automatic redirections were attempted for ${autoRedirectChain.join(" -> ")}`
          );
        }

        // 302/303 should default to GET on redirect even if POST on original.
        if (HttpClient.requestRequiresForceGet(response.statusCode, response.request.method)) {
          request.method = "GET";
          request.contentData = null;
          request.contentSummary = null;
        }

        response = await this.executeRequest(request, cookieJar);
      } while (response.hasHttpRedirect);
    }

    if (response.hasHttpRedirect && process.env.NODE_ENV !== "production") {
      this.logger.error(
        "Server requested a redirect to [%s] while in developer mode. Update the request URL to avoid this redirect.",
        response.headers.getSingleValue("Location")
      );
    }

    if (!request.suppressHttpError && response.hasHttpError) {
      const suppressed =
        request.suppressHttpErrorStatusCodes?.includes(response.statusCode) ?? false;

      if (!suppressed) {
        if (request.logHttpError) {
          this.logger.warn("HTTP Error - %s", response.toString());
        }

        if (response.statusCode === 429) {
          throw new TooManyRequestsException(request, response);
        }

        throw new HttpException(request, response);
      }
    }

    return response;
  }

  private static requestRequiresForceGet(statusCode: number, requestMethod: string): boolean {
    switch (statusCode) {
      case 301:
      case 302:
      case 300:
        return requestMethod === "POST";
      case 303:
        return requestMethod !== "GET" && requestMethod !== "HEAD";
      default:
        return false;
    }
  }

  private async executeRequest(request: HttpRequest, cookieJar: CookieJar): Promise<HttpResponse> {
    let effectiveRequest = request;

    for (const interceptor of this.requestInterceptors) {
      effectiveRequest = interceptor.preRequest(effectiveRequest);
    }

    if (effectiveRequest.rateLimit !== 0) {
      await this.rateLimitService.waitAndPulse(
        effectiveRequest.url.host,
        effectiveRequest.rateLimitKey,
        effectiveRequest.rateLimit
      );
    }

    this.logger.trace(effectiveRequest.toString());

    const start = Date.now();

    let response = await this.httpDispatcher.getResponse(effectiveRequest, cookieJar);

    this.handleResponseCookies(response, cookieJar);

    const elapsedMs = Date.now() - start;

    this.logger.trace("%s (%d ms)", response.toString(), elapsedMs);

    for (const interceptor of this.requestInterceptors) {
      response = interceptor.postResponse(response);
    }

    if (effectiveRequest.logResponseContent && response.responseData !== null) {
      this.logger.trace(
        "Response content (%d bytes): %s",
        response.responseData.length,
        response.content
      );
    }

    return response;
  }

  private initializeRequestCookies(request: HttpRequest): CookieJar {
    // Readarr sources cookies from both the persistent jar and any explicit
    // request.Cookies, merging into a fresh per-request CookieContainer.
    // We mutate a scoped CookieJar the same way.
    const jar = new CookieJar();

    for (const [name, value] of this.persistentCookieJar.getCookies(request.url.host)) {
      jar.add(request.url.host, name, value);
    }

    for (const [key, value] of request.cookies) {
      if (value === null) {
        jar.add(request.url.host, key, "", Date.now() - 1);
      } else {
        jar.add(request.url.host, key, value, Date.now() + 60 * 60 * 1000);

        if (request.storeRequestCookie) {
          this.persistentCookieJar.add(request.url.host, key, value, Date.now() + 60 * 60 * 1000);
        }
      }
    }

    return jar;
  }

  private handleResponseCookies(response: HttpResponse, jar: CookieJar): void {
    jar.expireAll(response.request.url.host);

    const cookieHeaders = response.getCookieHeaders();

    if (cookieHeaders.length === 0) {
      return;
    }

    jar.setCookiesFromHeaders(response.request.url.host, cookieHeaders);

    if (response.request.storeResponseCookie) {
      this.persistentCookieJar.setCookiesFromHeaders(response.request.url.host, cookieHeaders);
    }
  }

  async downloadFile(url: string, fileName: string): Promise<void> {
    const fs = await import("node:fs");
    const fsPromises = fs.promises;
    const path = await import("node:path");

    const fileNamePart = fileName + ".part";

    try {
      const dir = path.dirname(fileName);
      await fsPromises.mkdir(dir, { recursive: true });

      this.logger.trace("Downloading [%s] to [%s]", url, fileName);

      const start = Date.now();
      const fileStream = fs.createWriteStream(fileNamePart);

      const request = new HttpRequest(url);
      request.allowAutoRedirect = true;
      request.responseStream = fileStream;
      request.requestTimeout = 300_000;

      const response = await this.get(request);

      await new Promise<void>((resolve, reject) => {
        fileStream.end((err: NodeJS.ErrnoException | null | undefined) =>
          err ? reject(err) : resolve()
        );
      });

      if (response.headers.contentType?.includes("text/html")) {
        throw new HttpException(request, response, "Site responded with html content.");
      }

      const elapsedSeconds = Math.floor((Date.now() - start) / 1000);

      try {
        await fsPromises.unlink(fileName);
      } catch {
        // File doesn't exist yet -- fine, matches File.Exists(fileName) guard.
      }

      await fsPromises.rename(fileNamePart, fileName);
      this.logger.trace("Downloading Completed. took %ds", elapsedSeconds);
    } finally {
      try {
        await fsPromises.unlink(fileNamePart);
      } catch {
        // Already moved/never created -- matches File.Exists(fileNamePart) guard.
      }
    }
  }

  get(request: HttpRequest): Promise<HttpResponse> {
    request.method = "GET";
    return this.execute(request);
  }

  async getTyped<T>(request: HttpRequest): Promise<TypedHttpResponse<T>> {
    const response = await this.get(request);
    this.checkResponseContentType(response);
    return new TypedHttpResponse<T>(response);
  }

  head(request: HttpRequest): Promise<HttpResponse> {
    request.method = "HEAD";
    return this.execute(request);
  }

  post(request: HttpRequest): Promise<HttpResponse> {
    request.method = "POST";
    return this.execute(request);
  }

  async postTyped<T>(request: HttpRequest): Promise<TypedHttpResponse<T>> {
    const response = await this.post(request);
    this.checkResponseContentType(response);
    return new TypedHttpResponse<T>(response);
  }

  private checkResponseContentType(response: HttpResponse): void {
    if (response.headers.contentType?.includes("text/html")) {
      throw new UnexpectedHtmlContentException(response);
    }
  }
}

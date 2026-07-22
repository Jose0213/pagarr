// Ported from NzbDrone.Common/Http/Dispatchers/ManagedHttpDispatcher.cs
//
// Adaptation notes (fetch() vs .NET SocketsHttpHandler):
//  - IPv6-then-IPv4 "Happy Eyeballs" fallback (onConnect/attemptConnection in
//    the C#) is handled internally by Node's fetch/undici + the OS resolver;
//    there's no equivalent connect-callback hook to port, so it's omitted.
//  - ICertificateValidationService (bypass cert errors for indexers with
//    known-bad certs) has no fetch() equivalent without dropping to the
//    `https` module with a custom Agent; out of scope for this port pass
//    since it depends on Configuration (not yet ported) for the bypass
//    list. Left as a documented gap -- see ICertificateValidationService.ts.
//  - Digest auth (NetworkCredential + CredentialCache challenge/response) is
//    NOT implemented -- fetch() has no automatic 401-challenge retry
//    machinery, and reimplementing RFC 7616 digest is out of scope for this
//    module. Only Basic auth (BasicNetworkCredential, sent up front) works.
//  - Proxy support: HttpProxySettings/ProxyType are ported faithfully as
//    data types (see proxy/), but undiciwiring an actual HTTP/SOCKS4/SOCKS5
//    proxy into global fetch requires either Node's experimental
//    `setGlobalDispatcher(new ProxyAgent(...))` (undici, bundled with Node
//    but its Proxy/Socks agents are a separate opt-in) or a third-party
//    socks lib -- both against this module's "no extra deps" constraint.
//    getProxyAgent() below is the seam a later pass can fill in once that
//    tradeoff is revisited; for now proxied requests throw clearly instead
//    of silently connecting direct.

import { HttpHeader } from "../HttpHeader.js";
import { HttpRequest } from "../HttpRequest.js";
import { HttpResponse } from "../HttpResponse.js";
import type { CookieJar } from "../CookieJar.js";
import type { IHttpDispatcher } from "./IHttpDispatcher.js";
import type { IHttpProxySettingsProvider } from "../proxy/IHttpProxySettingsProvider.js";
import type { IUserAgentBuilder } from "../UserAgentBuilder.js";

const DEFAULT_TIMEOUT_MS = 100_000; // matches System.Net.Http.HttpClient's 100s default

export class ManagedHttpDispatcher implements IHttpDispatcher {
  constructor(
    private readonly userAgentBuilder: IUserAgentBuilder,
    private readonly proxySettingsProvider?: IHttpProxySettingsProvider
  ) {}

  async getResponse(request: HttpRequest, cookies: CookieJar): Promise<HttpResponse> {
    const headers = new Headers();

    headers.set("User-Agent", this.userAgentBuilder.getUserAgent(request.useSimplifiedUserAgent));

    if (!request.connectionKeepAlive) {
      headers.set("Connection", "close");
    }

    const cookieHeader = cookies.getCookieHeader(request.url.host);
    if (cookieHeader.length > 0) {
      headers.set("Cookie", cookieHeader);
    }

    if (request.credentials) {
      if (request.credentials.kind === "basic") {
        const authInfo = `${request.credentials.userName}:${request.credentials.password}`;
        headers.set("Authorization", "Basic " + Buffer.from(authInfo, "latin1").toString("base64"));
      } else {
        // NetworkCredential (non-basic, challenge/response) -- see file-header note.
        throw new Error(
          "Digest/challenge-response credentials are not supported by the fetch-based dispatcher; use a BasicNetworkCredential."
        );
      }
    }

    this.applyRequestHeaders(headers, request.headers);

    if (this.proxySettingsProvider?.getProxySettingsForUri(request.url)) {
      throw new Error(
        "HTTP/SOCKS proxying is not implemented in ManagedHttpDispatcher (fetch() has no built-in proxy support); see file header."
      );
    }

    const controller = new AbortController();
    const timeoutMs = request.requestTimeout > 0 ? request.requestTimeout : DEFAULT_TIMEOUT_MS;
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(request.url.toString(), {
        method: request.method,
        headers,
        body: request.contentData ?? undefined,
        redirect: "manual",
        signal: controller.signal,
      });

      let data: Uint8Array | null = null;

      if (request.responseStream && response.status === 200 && response.body) {
        await this.pipeToResponseStream(response.body, request.responseStream);
      } else {
        const buf = await response.arrayBuffer();
        data = new Uint8Array(buf);
      }

      const responseHeaders = this.toHttpHeader(response.headers);

      return new HttpResponse(request, responseHeaders, data, response.status, this.httpVersion(response));
    } catch (err) {
      if (controller.signal.aborted) {
        throw new Error(`Http request timed out: ${request.url.toString()}`);
      }

      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }

  private httpVersion(_response: Response): string {
    // fetch()/undici doesn't expose the negotiated HTTP version on the
    // Response object; the C# recorded responseMessage.Version from
    // HttpClient's transport info. We can't populate this faithfully
    // without a lower-level API, so we report a fixed placeholder.
    return "1.1";
  }

  private async pipeToResponseStream(
    body: ReadableStream<Uint8Array>,
    stream: NodeJS.WritableStream
  ): Promise<void> {
    const reader = body.getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        await new Promise<void>((resolve, reject) => {
          stream.write(value, (err) => (err ? reject(err) : resolve()));
        });
      }
    } finally {
      reader.releaseLock();
    }
  }

  private toHttpHeader(headers: Headers): HttpHeader {
    const result = new HttpHeader();
    headers.forEach((value, key) => {
      // fetch's Headers folds multi-value headers (e.g. Set-Cookie) using
      // undici's getSetCookie() for that one case; everything else arrives
      // comma-joined, matching .NET's HttpHeaders.ToNameValueCollection
      // behavior of ConcatToString(";") closely enough for our purposes.
      result.add(key, value);
    });

    if (typeof headers.getSetCookie === "function") {
      const setCookies = headers.getSetCookie();
      if (setCookies.length > 0) {
        result.remove("set-cookie");
        for (const cookie of setCookies) {
          result.add("Set-Cookie", cookie);
        }
      }
    }

    return result;
  }

  private applyRequestHeaders(headers: Headers, httpHeader: HttpHeader): void {
    for (const [key, value] of httpHeader) {
      switch (key) {
        case "Proxy-Connection":
          throw new Error("Proxy-Connection header is not supported");
        default:
          headers.append(key, value);
          break;
      }
    }
  }
}

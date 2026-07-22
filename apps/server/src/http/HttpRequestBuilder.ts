// Ported from NzbDrone.Common/Http/HttpRequestBuilder.cs

import { HttpHeader } from "./HttpHeader.js";
import type { HttpAccept } from "./HttpAccept.js";
import { HttpUri } from "./HttpUri.js";
import { HttpRequest, type HttpMethod } from "./HttpRequest.js";
import type { HttpFormData } from "./HttpFormData.js";
import type { HttpCredential } from "./HttpCredential.js";

export class HttpRequestBuilder {
  method: HttpMethod = "GET";
  httpAccept: HttpAccept | null = null;
  baseUrl: HttpUri;
  resourceUrl = "";
  queryParams: Array<[string, string]> = [];
  suffixQueryParams: Array<[string, string]> = [];
  segments = new Map<string, string>();
  headers = new HttpHeader();
  suppressHttpError = false;
  suppressHttpErrorStatusCodes: number[] | null = null;
  logHttpError = true;
  useSimplifiedUserAgent = false;
  allowAutoRedirect = false;
  connectionKeepAlive = false;
  /** Milliseconds, matching TimeSpan.Zero default of "no rate limit". */
  rateLimit = 0;
  logResponseContent = false;
  networkCredential: HttpCredential | null = null;
  cookies = new Map<string, string>();
  formData: HttpFormData[] = [];
  postProcess: ((request: HttpRequest) => void) | null = null;

  constructor(baseUrl: string);
  constructor(useHttps: boolean, host: string, port: number, urlBase?: string);
  constructor(
    baseUrlOrHttps: string | boolean,
    host?: string,
    port?: number,
    urlBase?: string
  ) {
    if (typeof baseUrlOrHttps === "string") {
      this.baseUrl = new HttpUri(baseUrlOrHttps);
    } else {
      this.baseUrl = new HttpUri(
        HttpRequestBuilder.buildBaseUrl(baseUrlOrHttps, host!, port!, urlBase)
      );
    }
  }

  static buildBaseUrl(useHttps: boolean, host: string, port: number, urlBase?: string): string {
    const protocol = useHttps ? "https" : "http";
    let base = urlBase;

    if (isNotNullOrWhiteSpace(base) && !base.startsWith("/")) {
      base = "/" + base;
    }

    return `${protocol}://${host}:${port}${base ?? ""}`;
  }

  clone(): HttpRequestBuilder {
    const clone = Object.create(Object.getPrototypeOf(this)) as HttpRequestBuilder;
    Object.assign(clone, this);
    clone.queryParams = [...this.queryParams];
    clone.suffixQueryParams = [...this.suffixQueryParams];
    clone.segments = new Map(this.segments);
    clone.headers = new HttpHeader(this.headers);
    clone.cookies = new Map(this.cookies);
    clone.formData = [...this.formData];
    return clone;
  }

  protected createUri(): HttpUri {
    let url = this.baseUrl
      .combinePath(this.resourceUrl)
      .addQueryParams([...this.queryParams, ...this.suffixQueryParams]);

    if (this.segments.size > 0) {
      let fullUri = url.fullUri;

      for (const [key, value] of this.segments) {
        fullUri = fullUri.split(key).join(value);
      }

      url = new HttpUri(fullUri);
    }

    return url;
  }

  protected createRequest(): HttpRequest {
    return new HttpRequest(this.createUri().fullUri, {
      httpAccept: this.httpAccept ?? undefined,
    });
  }

  protected apply(request: HttpRequest): void {
    request.method = this.method;
    request.suppressHttpError = this.suppressHttpError;
    request.suppressHttpErrorStatusCodes = this.suppressHttpErrorStatusCodes;
    request.logHttpError = this.logHttpError;
    request.useSimplifiedUserAgent = this.useSimplifiedUserAgent;
    request.allowAutoRedirect = this.allowAutoRedirect;
    request.connectionKeepAlive = this.connectionKeepAlive;
    request.rateLimit = this.rateLimit;
    request.logResponseContent = this.logResponseContent;
    request.credentials = this.networkCredential;

    for (const [key, value] of this.headers) {
      request.headers.set(key, value);
    }

    for (const [key, value] of this.cookies) {
      request.cookies.set(key, value);
    }

    this.applyFormData(request);
  }

  build(): HttpRequest {
    const request = this.createRequest();

    this.apply(request);

    if (this.postProcess) {
      this.postProcess(request);
    }

    return request;
  }

  createFactory(): HttpRequestBuilderFactory {
    return new HttpRequestBuilderFactory(this);
  }

  protected applyFormData(request: HttpRequest): void {
    if (this.formData.length === 0) {
      return;
    }

    if (request.contentData !== null) {
      throw new Error("Cannot send HttpRequest Body and FormData simultaneously.");
    }

    const shouldSendAsMultipart = this.formData.some(
      (v) => v.contentType != null || v.fileName != null || v.contentData.length > 1024
    );

    if (shouldSendAsMultipart) {
      const boundary = "-----------------------------" + Date.now().toString(16);
      const partBoundary = `--${boundary}\r\n`;
      const endBoundary = `--${boundary}--\r\n`;

      const chunks: Buffer[] = [];
      let summary = "";

      for (const formData of this.formData) {
        chunks.push(Buffer.from(partBoundary, "utf8"));

        let disposition = "Content-Disposition: form-data";
        if (isNotNullOrWhiteSpace(formData.name)) {
          disposition += `; name="${formData.name}"`;
        }

        if (isNotNullOrWhiteSpace(formData.fileName)) {
          disposition += `; filename="${formData.fileName}"`;
        }

        disposition += "\r\n";
        chunks.push(Buffer.from(disposition, "utf8"));

        if (isNotNullOrWhiteSpace(formData.contentType)) {
          chunks.push(Buffer.from(`Content-Type: ${formData.contentType}\r\n`, "utf8"));
        }

        chunks.push(Buffer.from("\r\n", "utf8"));
        chunks.push(Buffer.from(formData.contentData));
        chunks.push(Buffer.from("\r\n", "utf8"));

        if (isNotNullOrWhiteSpace(formData.fileName)) {
          summary += `\r\n${formData.name}=${formData.fileName} (${formData.contentData.length} bytes)`;
        } else {
          summary += `\r\n${formData.name}=${Buffer.from(formData.contentData).toString("utf8")}`;
        }
      }

      chunks.push(Buffer.from(endBoundary, "utf8"));

      const body = Buffer.concat(chunks);

      request.headers.contentType = "multipart/form-data; boundary=" + boundary;
      request.setContent(new Uint8Array(body));

      if (request.contentSummary === null) {
        request.contentSummary = summary;
      }
    } else {
      const parameters = this.formData.map(
        (v) => `${v.name}=${encodeURIComponent(Buffer.from(v.contentData).toString("utf8"))}`
      );
      const urlencoded = parameters.join("&");
      const body = Buffer.from(urlencoded, "utf8");

      request.headers.contentType = "application/x-www-form-urlencoded";
      request.setContent(new Uint8Array(body));

      if (request.contentSummary === null) {
        request.contentSummary = urlencoded;
      }
    }
  }

  resource(resourceUrl: string): this {
    if (!isNotNullOrWhiteSpace(this.resourceUrl) || resourceUrl.startsWith("/")) {
      this.resourceUrl = trimStart(resourceUrl, "/");
    } else {
      this.resourceUrl = `${trimEnd(this.resourceUrl, "/")}/${resourceUrl}`;
    }

    return this;
  }

  keepAlive(keepAlive = true): this {
    this.connectionKeepAlive = keepAlive;
    return this;
  }

  withRateLimit(seconds: number): this {
    this.rateLimit = seconds * 1000;
    return this;
  }

  post(): this {
    this.method = "POST";
    return this;
  }

  accept(accept: HttpAccept): this {
    this.httpAccept = accept;
    return this;
  }

  setHeader(name: string, value: string): this {
    this.headers.set(name, value);
    return this;
  }

  addPrefixQueryParam(key: string, value: unknown, replace = false): this {
    if (replace) {
      this.queryParams = this.queryParams.filter(([k]) => k !== key);
      this.suffixQueryParams = this.suffixQueryParams.filter(([k]) => k !== key);
    }

    this.queryParams.unshift([key, String(value)]);
    return this;
  }

  addQueryParam(key: string, value: unknown, replace = false): this {
    if (replace) {
      this.queryParams = this.queryParams.filter(([k]) => k !== key);
      this.suffixQueryParams = this.suffixQueryParams.filter(([k]) => k !== key);
    }

    this.queryParams.push([key, String(value)]);
    return this;
  }

  addSuffixQueryParam(key: string, value: unknown, replace = false): this {
    if (replace) {
      this.queryParams = this.queryParams.filter(([k]) => k !== key);
      this.suffixQueryParams = this.suffixQueryParams.filter(([k]) => k !== key);
    }

    this.suffixQueryParams.push([key, String(value)]);
    return this;
  }

  setSegment(segment: string, value: string, dontCheck = false): this {
    const key = `{${segment}}`;

    if (!dontCheck && !this.createUri().toString().includes(key)) {
      throw new Error(`Segment ${segment} is not defined in Uri`);
    }

    this.segments.set(key, value);
    return this;
  }

  setCookies(cookies: Iterable<readonly [string, string]>): this {
    for (const [key, value] of cookies) {
      this.cookies.set(key, value);
    }

    return this;
  }

  setCookie(key: string, value: string): this {
    this.cookies.set(key, value);
    return this;
  }

  addFormParameter(key: string, value: unknown): this {
    if (this.method !== "POST") {
      throw new Error("HttpRequest Method must be POST to add FormParameter.");
    }

    this.formData.push({
      name: key,
      contentData: new TextEncoder().encode(String(value)),
    });

    return this;
  }

  addFormUpload(
    name: string,
    fileName: string,
    data: Uint8Array,
    contentType = "application/octet-stream"
  ): this {
    if (this.method !== "POST") {
      throw new Error("HttpRequest Method must be POST to add FormUpload.");
    }

    this.formData.push({
      name,
      fileName,
      contentData: data,
      contentType,
    });

    return this;
  }
}

export interface IHttpRequestBuilderFactory {
  create(): HttpRequestBuilder;
}

// Ported from NzbDrone.Common/Http/HttpRequestBuilderFactory.cs
export class HttpRequestBuilderFactory implements IHttpRequestBuilderFactory {
  private rootBuilder: HttpRequestBuilder;

  constructor(rootBuilder: HttpRequestBuilder) {
    this.rootBuilder = rootBuilder.clone();
  }

  create(): HttpRequestBuilder {
    return this.rootBuilder.clone();
  }
}

function isNotNullOrWhiteSpace(value: string | null | undefined): value is string {
  return value !== null && value !== undefined && value.trim() !== "";
}

function trimStart(value: string, char: string): string {
  let i = 0;
  while (i < value.length && value[i] === char) {
    i++;
  }
  return value.slice(i);
}

function trimEnd(value: string, char: string): string {
  let i = value.length;
  while (i > 0 && value[i - 1] === char) {
    i--;
  }
  return value.slice(0, i);
}

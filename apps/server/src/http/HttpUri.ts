// Ported from NzbDrone.Common/Http/HttpUri.cs
//
// Readarr's HttpUri is a hand-rolled URI wrapper (not System.Uri) because it
// needs to represent partial/relative URIs (scheme-less, host-less) that
// System.Uri chokes on, and to support cheap "+"-style combination of a base
// URL with a relative redirect Location header. We keep that same shape here
// rather than using the WHATWG URL class, which refuses to parse relative or
// partial URLs the way HttpUri.cs does.

const URI_REGEX =
  /^(?:(?<scheme>[a-z]+):)?(?:\/\/(?<host>[-_A-Z0-9.]+|\[[A-F0-9:]+\])(?::(?<port>[0-9]{1,5}))?)?(?<path>(?:(?:^|\/+)[^/?#\r\n]+)+\/*|\/+)?(?:\?(?<query>[^#\r\n]*))?(?:#(?<fragment>.*))?$/i;

export class HttpUri {
  private readonly _uri: string;

  readonly scheme: string;
  readonly host: string;
  readonly port: number | null;
  readonly path: string;
  readonly query: string;
  readonly fragment: string;

  private _queryParams: Array<[string, string | null]> | null = null;

  constructor(uri: string);
  constructor(
    scheme: string | null,
    host: string | null,
    port: number | null,
    path: string | null,
    query: string | null,
    fragment: string | null
  );
  constructor(
    uriOrScheme: string | null,
    host?: string | null,
    port?: number | null,
    path?: string | null,
    query?: string | null,
    fragment?: string | null
  ) {
    if (arguments.length === 1) {
      this._uri = uriOrScheme ?? "";
    } else {
      let builder = "";

      const scheme = uriOrScheme;
      if (isNotNullOrWhiteSpace(scheme)) {
        builder += scheme + ":";
      }

      if (isNotNullOrWhiteSpace(host)) {
        builder += "//" + host;
        if (port !== null && port !== undefined) {
          builder += ":" + port;
        }
      }

      if (isNotNullOrWhiteSpace(path)) {
        if (isNotNullOrWhiteSpace(host) || path.startsWith("/")) {
          builder += "/";
        }

        builder += path.replace(/^\/+/, "");
      }

      if (isNotNullOrWhiteSpace(query)) {
        builder += "?" + query;
      }

      if (isNotNullOrWhiteSpace(fragment)) {
        builder += "#" + fragment;
      }

      this._uri = builder;
    }

    const parsed = this.parse(this._uri);
    this.scheme = parsed.scheme;
    this.host = parsed.host;
    this.port = parsed.port;
    this.path = parsed.path;
    this.query = parsed.query;
    this.fragment = parsed.fragment;
  }

  get fullUri(): string {
    return this._uri;
  }

  private parse(uri: string): {
    scheme: string;
    host: string;
    port: number | null;
    path: string;
    query: string;
    fragment: string;
  } {
    const match = URI_REGEX.exec(uri);

    if (!match || !match.groups) {
      throw new Error("Uri didn't match expected pattern: " + uri);
    }

    const scheme = match.groups.scheme ?? "";
    const host = match.groups.host ?? "";
    const port = match.groups.port ?? "";
    const path = match.groups.path ?? "";
    const query = match.groups.query ?? "";
    const fragment = match.groups.fragment ?? "";

    // Mirrors the C# guard: scheme without host but with a path is invalid
    // (e.g. malformed "http:/something" style edge cases).
    if (scheme !== "" && host === "" && path !== "") {
      throw new Error("Uri didn't match expected pattern: " + uri);
    }

    return {
      scheme,
      host,
      port: port === "" ? null : Number.parseInt(port, 10),
      path,
      query,
      fragment,
    };
  }

  private get queryParams(): Array<[string, string | null]> {
    if (this._queryParams === null) {
      const result: Array<[string, string | null]> = [];

      if (isNotNullOrWhiteSpace(this.query)) {
        for (const pair of this.query.split("&")) {
          const idx = pair.indexOf("=");
          if (idx === -1) {
            result.push([decodeURIComponent(pair), null]);
          } else {
            result.push([
              decodeURIComponent(pair.slice(0, idx)),
              decodeURIComponent(pair.slice(idx + 1)),
            ]);
          }
        }
      }

      this._queryParams = result;
    }

    return this._queryParams;
  }

  getQueryParams(): Array<[string, string | null]> {
    return this.queryParams;
  }

  static combinePath(basePath: string, relativePath: string): string {
    if (isNullOrWhiteSpace(relativePath)) {
      return basePath;
    }

    if (isNullOrWhiteSpace(basePath)) {
      return relativePath;
    }

    return trimEnd(basePath, "/") + "/" + trimStart(relativePath, "/");
  }

  private static combineRelativePath(basePath: string, relativePath: string): string {
    if (isNullOrWhiteSpace(relativePath)) {
      return basePath;
    }

    if (relativePath.startsWith("/")) {
      return relativePath;
    }

    const baseSlashIndex = basePath.lastIndexOf("/");

    if (baseSlashIndex >= 0) {
      return `${basePath.slice(0, baseSlashIndex)}/${relativePath}`;
    }

    return relativePath;
  }

  combinePath(path: string): HttpUri {
    return new HttpUri(
      this.scheme,
      this.host,
      this.port,
      HttpUri.combinePath(this.path, path),
      this.query,
      this.fragment
    );
  }

  setQuery(query: string): HttpUri {
    return new HttpUri(this.scheme, this.host, this.port, this.path, query, this.fragment);
  }

  addQueryParam(key: string, value: unknown): HttpUri {
    let newQuery = `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`;

    if (isNotNullOrWhiteSpace(this.query)) {
      newQuery = `${this.query}&${newQuery}`;
    }

    return this.setQuery(newQuery);
  }

  addQueryParams(queryParams: Iterable<readonly [string, string]>): HttpUri {
    let result = this.query;

    for (const [key, value] of queryParams) {
      if (result.length !== 0) {
        result += "&";
      }

      result += encodeURIComponent(key) + "=" + encodeURIComponent(value);
    }

    return this.setQuery(result);
  }

  toString(): string {
    return this._uri;
  }

  equals(other: HttpUri | string | null | undefined): boolean {
    if (other === null || other === undefined) {
      return false;
    }

    if (typeof other === "string") {
      return this._uri === other;
    }

    return this._uri === other._uri;
  }

  /** Mirrors HttpUri's explicit conversion to System.Uri for use with fetch/URL-consuming code. */
  toUrl(): URL {
    return new URL(this._uri);
  }

  /**
   * Mirrors HttpUri's `operator +`: combine a base URL with a relative URL
   * (typically a redirect Location header), preferring the relative URL's
   * own scheme/host/path when present.
   */
  static combine(baseUrl: HttpUri, relativeUrl: HttpUri): HttpUri {
    if (isNotNullOrWhiteSpace(relativeUrl.scheme)) {
      return relativeUrl;
    }

    if (isNotNullOrWhiteSpace(relativeUrl.host)) {
      return new HttpUri(
        baseUrl.scheme,
        relativeUrl.host,
        relativeUrl.port,
        relativeUrl.path,
        relativeUrl.query,
        relativeUrl.fragment
      );
    }

    if (isNotNullOrWhiteSpace(relativeUrl.path)) {
      return new HttpUri(
        baseUrl.scheme,
        baseUrl.host,
        baseUrl.port,
        HttpUri.combineRelativePath(baseUrl.path, relativeUrl.path),
        relativeUrl.query,
        relativeUrl.fragment
      );
    }

    return new HttpUri(
      baseUrl.scheme,
      baseUrl.host,
      baseUrl.port,
      baseUrl.path,
      relativeUrl.query,
      relativeUrl.fragment
    );
  }
}

function isNullOrWhiteSpace(value: string | null | undefined): value is null | undefined | "" {
  return value === null || value === undefined || value.trim() === "";
}

function isNotNullOrWhiteSpace(value: string | null | undefined): value is string {
  return !isNullOrWhiteSpace(value);
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

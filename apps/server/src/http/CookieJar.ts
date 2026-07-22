// Readarr's HttpClient uses System.Net.CookieContainer, cached per-process
// via ICacheManager, to persist cookies across requests (session cookies
// from login flows on indexer/download-client sites, etc). Node's fetch()
// has no built-in cookie jar (unlike browsers), so we port CookieContainer's
// relevant surface -- store-by-domain-path, expire, and header
// serialization -- as this small class rather than reimplement RFC 6265
// domain/path matching in full. HttpClient.ts is the only intended caller;
// tests exercise it directly for the header round-trip.

interface StoredCookie {
  name: string;
  value: string;
  /** epoch ms; null means session cookie (until process restart). */
  expires: number | null;
}

export class CookieJar {
  // domain -> name -> cookie
  private readonly byDomain = new Map<string, Map<string, StoredCookie>>();

  private domainKey(hostname: string): string {
    return hostname.toLowerCase();
  }

  add(hostname: string, name: string, value: string, expiresMs: number | null = null): void {
    const key = this.domainKey(hostname);
    let cookies = this.byDomain.get(key);
    if (!cookies) {
      cookies = new Map();
      this.byDomain.set(key, cookies);
    }

    cookies.set(name, { name, value, expires: expiresMs });
  }

  expireAll(hostname: string): void {
    const cookies = this.byDomain.get(this.domainKey(hostname));
    if (cookies) {
      cookies.clear();
    }
  }

  /** Returns the live (non-expired) cookies for a host as a Set-Cookie-style `name=value; name2=value2` header. */
  getCookieHeader(hostname: string): string {
    const cookies = this.getCookies(hostname);
    return [...cookies.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
  }

  getCookies(hostname: string): Map<string, string> {
    const key = this.domainKey(hostname);
    const cookies = this.byDomain.get(key);
    const result = new Map<string, string>();

    if (!cookies) {
      return result;
    }

    const now = Date.now();
    for (const cookie of cookies.values()) {
      if (cookie.expires !== null && cookie.expires <= now) {
        continue;
      }
      result.set(cookie.name, cookie.value);
    }

    return result;
  }

  /** Parses one or more `Set-Cookie` header values and stores them for hostname. */
  setCookiesFromHeaders(hostname: string, setCookieHeaders: string[]): void {
    for (const header of setCookieHeaders) {
      try {
        this.setCookieFromHeader(hostname, header);
      } catch {
        // Mirrors HttpClient.AddCookiesToContainer: swallow malformed cookies,
        // logging is the caller's responsibility (this is a pure data structure).
      }
    }
  }

  private setCookieFromHeader(hostname: string, header: string): void {
    const parts = header.split(";").map((p) => p.trim());
    const first = parts[0];
    if (!first) {
      return;
    }

    const eq = first.indexOf("=");
    if (eq === -1) {
      return;
    }

    const name = first.slice(0, eq);
    const value = first.slice(eq + 1);

    let expires: number | null = null;
    for (const attr of parts.slice(1)) {
      const [attrName, attrValue] = attr.split("=").map((s) => s.trim());
      if (attrName?.toLowerCase() === "max-age" && attrValue) {
        const seconds = Number.parseInt(attrValue, 10);
        if (!Number.isNaN(seconds)) {
          expires = Date.now() + seconds * 1000;
        }
      } else if (attrName?.toLowerCase() === "expires" && attrValue) {
        const parsed = Date.parse(attrValue);
        if (!Number.isNaN(parsed)) {
          expires = parsed;
        }
      }
    }

    this.add(hostname, name, value, expires);
  }
}

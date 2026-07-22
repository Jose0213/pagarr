// Ported from NzbDrone.Common/Http/HttpHeader.cs
//
// C# HttpHeader subclasses NameValueCollection: case-insensitive keys, each
// key can hold multiple values (used for things like multiple Set-Cookie
// headers). We reimplement that shape with a Map<lowercasedKey, { original
// casing, values[] }> since JS has no built-in case-insensitive multi-map.

interface HeaderEntry {
  /** Original casing of the key as first set. */
  key: string;
  values: string[];
}

export class HttpHeader implements Iterable<[string, string]> {
  private readonly _entries = new Map<string, HeaderEntry>();

  constructor(init?: HttpHeader | Iterable<[string, string | string[]]> | Record<string, string>) {
    if (init instanceof HttpHeader) {
      for (const [key, entry] of init._entries) {
        this._entries.set(key, { key: entry.key, values: [...entry.values] });
      }
    } else if (init && typeof (init as Iterable<unknown>)[Symbol.iterator] === "function") {
      for (const [key, value] of init as Iterable<[string, string | string[]]>) {
        if (Array.isArray(value)) {
          for (const v of value) {
            this.add(key, v);
          }
        } else {
          this.add(key, value);
        }
      }
    } else if (init) {
      for (const [key, value] of Object.entries(init as Record<string, string>)) {
        this.add(key, value);
      }
    }
  }

  private static normalize(key: string): string {
    return key.toLowerCase();
  }

  containsKey(key: string): boolean {
    return this._entries.has(HttpHeader.normalize(key));
  }

  /** Sets a header, replacing any existing values (NameValueCollection.Set). */
  set(key: string, value: string): void {
    this._entries.set(HttpHeader.normalize(key), { key, values: [value] });
  }

  /** Adds a value, keeping any existing ones (NameValueCollection.Add). */
  add(key: string, value: string): void {
    const norm = HttpHeader.normalize(key);
    const existing = this._entries.get(norm);
    if (existing) {
      existing.values.push(value);
    } else {
      this._entries.set(norm, { key, values: [value] });
    }
  }

  remove(key: string): void {
    this._entries.delete(HttpHeader.normalize(key));
  }

  getValues(key: string): string[] | null {
    const entry = this._entries.get(HttpHeader.normalize(key));
    return entry ? [...entry.values] : null;
  }

  getSingleValue(key: string): string | null {
    const values = this.getValues(key);
    if (values === null || values.length === 0) {
      return null;
    }

    if (values.length > 1) {
      throw new Error(`Expected ${key} to occur only once, but was ${values.join("|")}.`);
    }

    return values[0]!;
  }

  get(key: string): string | null {
    const values = this.getValues(key);
    if (values === null || values.length === 0) {
      return null;
    }
    // .NET's indexer on NameValueCollection concatenates multi-values with ",".
    return values.join(",");
  }

  get allKeys(): string[] {
    return [...this._entries.values()].map((e) => e.key);
  }

  get contentLength(): number | null {
    const value = this.getSingleValue("Content-Length");
    return value === null ? null : Number.parseInt(value, 10);
  }

  set contentLength(value: number | null) {
    this.setSingleValue("Content-Length", value === null ? null : String(value));
  }

  get contentType(): string | null {
    return this.getSingleValue("Content-Type");
  }

  set contentType(value: string | null) {
    this.setSingleValue("Content-Type", value);
  }

  get accept(): string | null {
    return this.getSingleValue("Accept");
  }

  set accept(value: string | null) {
    this.setSingleValue("Accept", value);
  }

  get lastModified(): Date | null {
    const value = this.getSingleValue("Last-Modified");
    return value === null ? null : new Date(value);
  }

  set lastModified(value: Date | null) {
    this.setSingleValue("Last-Modified", value === null ? null : value.toUTCString());
  }

  private setSingleValue(key: string, value: string | null): void {
    if (value === null) {
      this.remove(key);
    } else {
      this.set(key, value);
    }
  }

  *[Symbol.iterator](): IterableIterator<[string, string]> {
    for (const entry of this._entries.values()) {
      for (const value of entry.values) {
        yield [entry.key, value];
      }
    }
  }

  getEncodingFromContentType(): string {
    return HttpHeader.getEncodingFromContentType(this.contentType ?? "");
  }

  /**
   * .NET resolves an Encoding object from the charset; we resolve to a
   * Node Buffer-supported encoding label instead (used with TextDecoder /
   * Buffer.toString) since JS has no direct Encoding-by-name registry.
   */
  static getEncodingFromContentType(contentType: string): string {
    let encoding: string | null = null;

    if (isNotNullOrWhiteSpace(contentType)) {
      const parts = contentType.toLowerCase().split(/[;= ]/);
      const idx = parts.indexOf("charset");
      if (idx !== -1 && idx + 1 < parts.length) {
        const charset = parts[idx + 1];
        if (isNotNullOrWhiteSpace(charset)) {
          encoding = charset.replace(/"/g, "");
        }
      }
    }

    return encoding ?? "utf-8";
  }

  static parseDateTime(value: string): Date {
    return new Date(value);
  }

  static parseCookies(cookies: string): Array<[string, string]> {
    return cookies
      .split(";")
      .filter((v) => v.trim() !== "")
      .map((v) => v.trim().split("="))
      .map((v): [string, string] => [v[0]!, v[1]!]);
  }
}

function isNotNullOrWhiteSpace(value: string | null | undefined): value is string {
  return value !== null && value !== undefined && value.trim() !== "";
}

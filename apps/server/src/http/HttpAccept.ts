// Ported from NzbDrone.Common/Http/HttpAccept.cs

export class HttpAccept {
  static readonly Rss = new HttpAccept(
    "application/rss+xml, text/rss+xml, application/xml, text/xml"
  );
  static readonly Json = new HttpAccept("application/json");
  static readonly Html = new HttpAccept("text/html");

  readonly value: string;

  constructor(accept: string) {
    this.value = accept;
  }

  toString(): string {
    return this.value;
  }
}

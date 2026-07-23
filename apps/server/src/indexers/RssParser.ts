import { HttpUri } from "../http/HttpUri.js";
import type { Language } from "../languages/language.js";
import { IndexerException } from "./exceptions/IndexerException.js";
import { SizeParsingException } from "./exceptions/SizeParsingException.js";
import { UnsupportedFeedException } from "./exceptions/UnsupportedFeedException.js";
import type { IndexerResponse } from "./IndexerResponse.js";
import type { IParseIndexerResponse } from "./IProcessIndexerResponse.js";
import { createReleaseInfo, type ReleaseInfo } from "./releaseInfo.js";
import type { RssEnclosure } from "./RssEnclosure.js";
import { parseDate, tryGetValue } from "./XElementExtensions.js";
import { XElement } from "./xml/XElement.js";
import { XmlCleaner } from "./XmlCleaner.js";

export const NZB_ENCLOSURE_MIME_TYPE = "application/x-nzb";
export const TORRENT_ENCLOSURE_MIME_TYPE = "application/x-bittorrent";
export const MAGNET_ENCLOSURE_MIME_TYPE = "application/x-bittorrent;x-scheme-handler/magnet";
export const USENET_ENCLOSURE_MIME_TYPES: readonly string[] = [NZB_ENCLOSURE_MIME_TYPE];
export const TORRENT_ENCLOSURE_MIME_TYPES: readonly string[] = [
  TORRENT_ENCLOSURE_MIME_TYPE,
  MAGNET_ENCLOSURE_MIME_TYPE,
];

/**
 * Minimal logger surface RssParser needs, matching this repo's
 * `http/HttpClient.ts` `HttpLogger` convention (`message, ...args` --
 * NLog-style format-string logging). C#'s NLog overloads like
 * `_logger.Warn(ex, "message {0}", arg)` (exception-first) are ported here
 * as `warn(message, ...args)` with the exception folded into the message
 * text at the call site (e.g. via a `%s` placeholder), since this repo's
 * existing logger shape has no separate exception-object parameter.
 */
export interface RssParserLogger {
  trace(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

const noopLogger: RssParserLogger = {
  trace: () => {},
  warn: () => {},
  error: () => {},
};

/**
 * Ported from NzbDrone.Core/Indexers/RssParser.cs. C#'s `protected virtual`
 * methods become `protected` TS methods a subclass can `override`; fields
 * that were mutable public properties (UseGuidInfoUrl, UseEnclosureUrl,
 * etc.) stay as plain public fields so subclasses (and their constructors,
 * matching e.g. TorznabRssParser's ctor body `UseEnclosureUrl = true;`) can
 * set them the same way.
 */
export class RssParser implements IParseIndexerResponse {
  useGuidInfoUrl = false;
  useEnclosureUrl = false;
  useEnclosureLength = false;
  parseSizeInDescription = false;
  preferredEnclosureMimeTypes: readonly string[] | null = null;

  protected readonly logger: RssParserLogger;
  private indexerResponse!: IndexerResponse;

  constructor(logger: RssParserLogger = noopLogger) {
    this.logger = logger;
  }

  parseResponse(indexerResponse: IndexerResponse): ReleaseInfo[] {
    this.indexerResponse = indexerResponse;

    const releases: ReleaseInfo[] = [];

    if (!this.preProcess(indexerResponse)) {
      return releases;
    }

    const document = this.loadXmlDocument(indexerResponse);
    const items = this.getItemsFromDocument(document);

    for (const item of items) {
      try {
        const reportInfo = this.processItem(item);
        if (reportInfo) {
          releases.push(reportInfo);
        }
      } catch (itemEx) {
        if (itemEx instanceof UnsupportedFeedException) {
          throw itemEx;
        }

        this.logger.error(
          "An error occurred while processing feed item from %s: %s",
          indexerResponse.request.url,
          itemEx
        );
      }
    }

    if (!this.postProcess(indexerResponse, items, releases)) {
      return [];
    }

    return releases;
  }

  protected loadXmlDocument(indexerResponse: IndexerResponse): XElement {
    try {
      let content = XmlCleaner.replaceEntities(indexerResponse.content);
      content = XmlCleaner.replaceUnicode(content);

      return XElement.parse(content);
    } catch (ex) {
      const contentSample = indexerResponse.content.slice(
        0,
        Math.min(indexerResponse.content.length, 512)
      );
      this.logger.trace(
        "Truncated response content (originally %d characters): %s",
        indexerResponse.content.length,
        contentSample
      );
      throw ex;
    }
  }

  protected createNewReleaseInfo(): ReleaseInfo {
    return createReleaseInfo();
  }

  protected preProcess(indexerResponse: IndexerResponse): boolean {
    // Server Down HTTP Errors are handled in HttpIndexerBase so ignore them here.
    if (
      indexerResponse.httpResponse.statusCode !== 200 &&
      !indexerResponse.httpResponse.hasHttpServerError
    ) {
      throw new IndexerException(
        indexerResponse,
        "Indexer API call resulted in an unexpected StatusCode [{0}]",
        indexerResponse.httpResponse.statusCode
      );
    }

    const contentType = indexerResponse.httpResponse.headers.contentType;
    const accept = indexerResponse.httpRequest.headers.accept;

    if (contentType?.includes("text/html") && accept !== null && !accept.includes("text/html")) {
      throw new IndexerException(
        indexerResponse,
        "Indexer responded with html content. Site is likely blocked or unavailable."
      );
    }

    return true;
  }

  protected postProcess(
    _indexerResponse: IndexerResponse,
    _elements: XElement[],
    _releases: ReleaseInfo[]
  ): boolean {
    return true;
  }

  private processItem(item: XElement): ReleaseInfo {
    let releaseInfo = this.createNewReleaseInfo();

    releaseInfo = this.processItemFields(item, releaseInfo);

    this.logger.trace("Parsed: %s", releaseInfo.title);

    return this.postProcessItem(item, releaseInfo);
  }

  protected processItemFields(item: XElement, releaseInfo: ReleaseInfo): ReleaseInfo {
    releaseInfo.guid = this.getGuid(item);
    releaseInfo.title = this.getTitle(item);
    releaseInfo.publishDate = this.getPublishDate(item).toISOString();
    releaseInfo.downloadUrl = this.getDownloadUrl(item) ?? "";
    releaseInfo.infoUrl = this.getInfoUrl(item);
    releaseInfo.commentUrl = this.getCommentUrl(item);
    releaseInfo.categories = this.getCategories(item);
    releaseInfo.languages = this.getLanguages(item);

    try {
      releaseInfo.size = this.getSize(item);
    } catch {
      throw new SizeParsingException("Unable to parse size from: {0}", releaseInfo.title);
    }

    return releaseInfo;
  }

  protected postProcessItem(_item: XElement, releaseInfo: ReleaseInfo): ReleaseInfo {
    return releaseInfo;
  }

  protected getGuid(item: XElement): string {
    const value = tryGetValue(item, "guid", "");
    return value !== "" ? value : randomGuid();
  }

  protected getTitle(item: XElement): string {
    return tryGetValue(item, "title", "Unknown");
  }

  protected getPublishDate(item: XElement): Date {
    const dateString = tryGetValue(item, "pubDate");

    if (dateString.trim() === "") {
      throw new UnsupportedFeedException(
        "Rss feed must have a pubDate element with a valid publish date."
      );
    }

    return parseDate(dateString);
  }

  protected getDownloadUrl(item: XElement): string | null {
    if (this.useEnclosureUrl) {
      const enclosure = this.getEnclosure(item);
      return enclosure ? this.parseUrl(enclosure.url) : null;
    }

    return this.parseUrl(item.element("link")?.value ?? null);
  }

  protected getInfoUrl(item: XElement): string | null {
    if (this.useGuidInfoUrl) {
      return this.parseUrl(item.element("guid")?.value ?? null);
    }

    return null;
  }

  protected getCommentUrl(item: XElement): string | null {
    return this.parseUrl(item.element("comments")?.value ?? null);
  }

  protected getCategories(_item: XElement): number[] {
    return [];
  }

  protected getLanguages(_item: XElement): Language[] {
    return [];
  }

  protected getSize(item: XElement): number {
    if (this.useEnclosureLength) {
      return this.getEnclosureLength(item);
    }

    if (this.parseSizeInDescription && item.element("description") !== null) {
      return RssParser.parseSize(item.element("description")!.value, true);
    }

    return 0;
  }

  protected getEnclosureLength(item: XElement): number {
    const enclosure = this.getEnclosure(item);
    return enclosure ? enclosure.length : 0;
  }

  protected getEnclosures(item: XElement): RssEnclosure[] {
    const enclosures: RssEnclosure[] = [];

    for (const v of item.elements("enclosure")) {
      try {
        enclosures.push({
          url: v.attribute("url"),
          type: v.attribute("type"),
          length: parseInt64OrZero(v.attribute("length")),
        });
      } catch (ex) {
        this.logger.warn(
          "Failed to get enclosure for: %s: %s",
          tryGetValue(item, "title", "Unknown"),
          ex
        );
      }
    }

    return enclosures;
  }

  protected getEnclosure(item: XElement, enforceMimeType = true): RssEnclosure | null {
    const enclosures = this.getEnclosures(item);
    return this.selectEnclosure(enclosures, enforceMimeType);
  }

  protected selectEnclosure(
    enclosures: RssEnclosure[],
    enforceMimeType = true
  ): RssEnclosure | null {
    if (enclosures.length === 0) {
      return null;
    }

    if (this.preferredEnclosureMimeTypes !== null) {
      for (const preferredType of this.preferredEnclosureMimeTypes) {
        const preferred = enclosures.find((v) => v.type === preferredType);
        if (preferred) {
          return preferred;
        }
      }

      if (enforceMimeType) {
        return null;
      }
    }

    if (enclosures.length > 1) {
      throw new Error("Sequence contains more than one element");
    }

    return enclosures[0] ?? null;
  }

  protected getItemsFromDocument(document: XElement): XElement[] {
    return this.getItems(document);
  }

  protected getItems(document: XElement): XElement[] {
    // `document` here IS the root element (this adapter's XElement.parse
    // returns the root directly rather than a separate XDocument wrapper --
    // see xml/XElement.ts), matching `document.Root` in the C# original.
    const channel = document.element("channel");

    if (channel === null) {
      return [];
    }

    return channel.elements("item");
  }

  protected parseUrl(value: string | null): string | null {
    if (value === null || value.trim() === "") {
      return null;
    }

    try {
      const baseUrl = this.indexerResponse.httpRequest.url;
      return HttpUri.combine(baseUrl, new HttpUri(value)).fullUri;
    } catch (ex) {
      this.logger.trace("Failed to parse Url %s, ignoring: %s", value, ex);
      return null;
    }
  }

  private static readonly PARSE_SIZE_REGEX = new RegExp(
    "(?<value>(?<!\\.\\d*)(?:\\d+,)*\\d+(?:\\.\\d{1,3})?)\\W?(?<unit>[KMG]i?B)(?![\\w/])",
    "gi"
  );

  static parseSize(sizeString: string, defaultToBinaryPrefix: boolean): number {
    if (sizeString.trim() === "") {
      return 0;
    }

    if ([...sizeString].every((c) => c >= "0" && c <= "9")) {
      return Number.parseInt(sizeString, 10);
    }

    RssParser.PARSE_SIZE_REGEX.lastIndex = 0;
    const match = RssParser.PARSE_SIZE_REGEX.exec(sizeString);

    if (match?.groups) {
      const value = Number.parseFloat(match.groups["value"]!.replace(/,/g, ""));
      const unit = match.groups["unit"]!.toLowerCase();

      switch (unit) {
        case "kb":
          return convertToBytes(value, 1, defaultToBinaryPrefix);
        case "mb":
          return convertToBytes(value, 2, defaultToBinaryPrefix);
        case "gb":
          return convertToBytes(value, 3, defaultToBinaryPrefix);
        case "kib":
          return convertToBytes(value, 1, true);
        case "mib":
          return convertToBytes(value, 2, true);
        case "gib":
          return convertToBytes(value, 3, true);
        default:
          return Math.trunc(value);
      }
    }

    return 0;
  }
}

function convertToBytes(value: number, power: number, binaryPrefix: boolean): number {
  const prefix = binaryPrefix ? 1024 : 1000;
  const multiplier = prefix ** power;
  return Math.round(value * multiplier);
}

function parseInt64OrZero(value: string | null): number {
  if (value === null) {
    return 0;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function randomGuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

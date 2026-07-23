import type { Language } from "../../languages/language.js";
import { findIsoLanguageByName } from "../isoLanguages.js";
import { ApiKeyException } from "../exceptions/ApiKeyException.js";
import { RequestLimitReachedException } from "../exceptions/RequestLimitReachedException.js";
import type { IndexerResponse } from "../IndexerResponse.js";
import { IndexerFlags, type ReleaseInfo, type TorrentInfo } from "../releaseInfo.js";
import { TorrentRssParser } from "../TorrentRssParser.js";
import { TORRENT_ENCLOSURE_MIME_TYPE, USENET_ENCLOSURE_MIME_TYPES } from "../RssParser.js";
import { tryGetValue } from "../XElementExtensions.js";
import { XElement } from "../xml/XElement.js";
import { TorznabException } from "./TorznabException.js";

const NS = "torznab:attr";

/** Ported from NzbDrone.Core/Indexers/Torznab/TorznabRssParser.cs. */
export class TorznabRssParser extends TorrentRssParser {
  constructor(...args: ConstructorParameters<typeof TorrentRssParser>) {
    super(...args);
    this.useEnclosureUrl = true;
  }

  protected override preProcess(indexerResponse: IndexerResponse): boolean {
    if (
      indexerResponse.httpResponse.hasHttpError &&
      (indexerResponse.httpResponse.headers.contentType === null ||
        !indexerResponse.httpResponse.headers.contentType.includes("xml"))
    ) {
      super.preProcess(indexerResponse);
    }

    const xdoc = this.loadXmlDocument(indexerResponse);
    const error = xdoc.name === "error" ? xdoc : xdoc.descendants("error")[0];

    if (!error) {
      return true;
    }

    const code = Number.parseInt(error.attribute("code") ?? "0", 10);
    const errorMessage = error.attribute("description") ?? "";

    if (code >= 100 && code <= 199) {
      throw new ApiKeyException("Invalid API key");
    }

    if (
      !indexerResponse.request.url.fullUri.includes("apikey=") &&
      errorMessage === "Missing parameter"
    ) {
      throw new ApiKeyException("Indexer requires an API key");
    }

    if (errorMessage === "Request limit reached") {
      throw new RequestLimitReachedException("API limit reached");
    }

    throw new TorznabException("Torznab error detected: {0}", errorMessage);
  }

  protected override postProcess(
    indexerResponse: IndexerResponse,
    items: XElement[],
    _releases: ReleaseInfo[]
  ): boolean {
    const enclosureTypes = [
      ...new Set(items.flatMap((item) => this.getEnclosures(item)).map((v) => v.type)),
    ];

    if (
      enclosureTypes.length > 0 &&
      this.preferredEnclosureMimeTypes !== null &&
      !enclosureTypes.some((t) => this.preferredEnclosureMimeTypes!.includes(t ?? ""))
    ) {
      if (enclosureTypes.some((t) => USENET_ENCLOSURE_MIME_TYPES.includes(t ?? ""))) {
        this.logger.warn(
          "%s does not contain %s, found %s, did you intend to add a Newznab indexer?",
          indexerResponse.request.url,
          TORRENT_ENCLOSURE_MIME_TYPE,
          enclosureTypes[0]
        );
        return false;
      }

      this.logger.warn(
        "%s does not contain %s, found %s.",
        indexerResponse.request.url,
        TORRENT_ENCLOSURE_MIME_TYPE,
        enclosureTypes[0]
      );
    }

    return true;
  }

  protected override processItemFields(item: XElement, releaseInfo: ReleaseInfo): TorrentInfo {
    const torrentInfo = super.processItemFields(item, releaseInfo);
    torrentInfo.indexerFlags = this.getFlags(item);
    return torrentInfo;
  }

  protected override getInfoUrl(item: XElement): string | null {
    return this.parseUrl(trimEndSuffix(tryGetValue(item, "comments"), "#comments"));
  }

  protected override getCommentUrl(item: XElement): string | null {
    return this.parseUrl(item.element("comments")?.value ?? null);
  }

  protected override getLanguages(item: XElement): Language[] {
    let languages = this.tryGetMultipleTorznabAttributes(item, "language");
    const results: Language[] = [];

    // Try to find <language> elements for some indexers that suck at following the rules.
    if (languages.length === 0) {
      languages = item.elements("language").map((e) => e.value);
    }

    for (const language of languages) {
      const mapped = findIsoLanguageByName(language)?.language;
      if (mapped) {
        results.push(mapped);
      }
    }

    return results;
  }

  protected override getSize(item: XElement): number {
    const sizeString = this.tryGetTorznabAttribute(item, "size");
    if (sizeString !== "" && !Number.isNaN(Number(sizeString))) {
      return Number.parseInt(sizeString, 10);
    }

    return this.getEnclosureLength(item);
  }

  protected override getCategories(item: XElement): number[] {
    const values = item
      .elements(NS)
      .filter(
        (e) =>
          (e.attribute("name") ?? "").toLowerCase() === "category" && e.attribute("value") !== null
      )
      .map((e) => e.attribute("value")!);

    const cats: number[] = [];
    for (const value of values) {
      const parsed = Number.parseInt(value, 10);
      if (!Number.isNaN(parsed)) {
        cats.push(parsed);
      }
    }

    return cats;
  }

  protected override getDownloadUrl(item: XElement): string | null {
    const url = super.getDownloadUrl(item);

    if (!isWellFormedAbsoluteUrl(url)) {
      return this.parseUrl(item.element("enclosure")?.attribute("url") ?? null);
    }

    return url;
  }

  protected override getInfoHash(item: XElement): string | null {
    const value = this.tryGetTorznabAttribute(item, "infohash");
    return value !== "" ? value : null;
  }

  protected override getMagnetUrl(item: XElement): string | null {
    const value = this.tryGetTorznabAttribute(item, "magneturl");
    return value !== "" ? value : null;
  }

  protected override getSeeders(item: XElement): number | null {
    const seeders = this.tryGetTorznabAttribute(item, "seeders");

    if (seeders !== "") {
      return Number.parseInt(seeders, 10);
    }

    return super.getSeeders(item);
  }

  protected override getPeers(item: XElement): number | null {
    const peers = this.tryGetTorznabAttribute(item, "peers");

    if (peers !== "") {
      return Number.parseInt(peers, 10);
    }

    const seeders = this.tryGetTorznabAttribute(item, "seeders");
    const leechers = this.tryGetTorznabAttribute(item, "leechers");

    if (seeders !== "" && leechers !== "") {
      return Number.parseInt(seeders, 10) + Number.parseInt(leechers, 10);
    }

    return super.getPeers(item);
  }

  protected getFlags(item: XElement): number {
    let flags = 0;

    const downloadFactor = this.tryGetFloatTorznabAttribute(item, "downloadvolumefactor", 1);
    const uploadFactor = this.tryGetFloatTorznabAttribute(item, "uploadvolumefactor", 1);

    if (downloadFactor === 0.5) {
      flags |= IndexerFlags.Halfleech;
    }

    if (downloadFactor === 0.75) {
      flags |= IndexerFlags.Freeleech25;
    }

    if (downloadFactor === 0.25) {
      flags |= IndexerFlags.Freeleech75;
    }

    if (downloadFactor === 0.0) {
      flags |= IndexerFlags.Freeleech;
    }

    if (uploadFactor === 2.0) {
      flags |= IndexerFlags.DoubleUpload;
    }

    const tags = this.tryGetMultipleTorznabAttributes(item, "tag");

    if (tags.some((t) => t.toLowerCase() === "internal")) {
      flags |= IndexerFlags.Internal;
    }

    if (tags.some((t) => t.toLowerCase() === "scene")) {
      flags |= IndexerFlags.Scene;
    }

    return flags;
  }

  protected tryGetTorznabAttribute(item: XElement, key: string, defaultValue = ""): string {
    const attrElement = item
      .elements(NS)
      .find((e) => (e.attribute("name") ?? "").toLowerCase() === key.toLowerCase());

    if (attrElement) {
      const attrValue = attrElement.attribute("value");
      if (attrValue !== null) {
        return attrValue;
      }
    }

    return defaultValue;
  }

  protected tryGetFloatTorznabAttribute(item: XElement, key: string, defaultValue = 0): number {
    const attr = this.tryGetTorznabAttribute(item, key, String(defaultValue));
    const parsed = Number.parseFloat(attr);
    return Number.isNaN(parsed) ? defaultValue : parsed;
  }

  protected tryGetMultipleTorznabAttributes(item: XElement, key: string): string[] {
    const attrElements = item
      .elements(NS)
      .filter((e) => (e.attribute("name") ?? "").toLowerCase() === key.toLowerCase());

    const results: string[] = [];
    for (const element of attrElements) {
      const attrValue = element.attribute("value");
      if (attrValue !== null) {
        results.push(attrValue);
      }
    }

    return results;
  }
}

function trimEndSuffix(value: string, suffix: string): string {
  return value.endsWith(suffix) ? value.slice(0, -suffix.length) : value;
}

function isWellFormedAbsoluteUrl(url: string | null): boolean {
  if (url === null) {
    return false;
  }
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

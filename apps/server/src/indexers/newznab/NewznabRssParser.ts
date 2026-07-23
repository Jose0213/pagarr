import type { Language } from "../../languages/language.js";
import { findIsoLanguageByName } from "../isoLanguages.js";
import { ApiKeyException } from "../exceptions/ApiKeyException.js";
import { RequestLimitReachedException } from "../exceptions/RequestLimitReachedException.js";
import type { IndexerResponse } from "../IndexerResponse.js";
import type { ReleaseInfo } from "../releaseInfo.js";
import { RssParser, USENET_ENCLOSURE_MIME_TYPES } from "../RssParser.js";
import { parseDate, tryGetValue } from "../XElementExtensions.js";
import { XElement } from "../xml/XElement.js";
import { NewznabException } from "./NewznabException.js";

const NS = "newznab:attr";

/**
 * Ported from `NewznabRssParser.CheckError(XDocument xdoc, IndexerResponse
 * indexerResponse)`. Exposed as a standalone function (rather than only a
 * static class member) since `NewznabCapabilitiesProvider.ParseCapabilities`
 * calls it directly against a parsed `<caps>` document, matching the C#
 * original's `NewznabRssParser.CheckError(xDoc, ...)` static call.
 */
export function checkNewznabError(xdoc: XElement, indexerResponse: IndexerResponse): void {
  const error = xdoc.name === "error" ? xdoc : xdoc.descendants("error")[0];

  if (!error) {
    return;
  }

  const code = Number.parseInt(error.attribute("code") ?? "0", 10);
  const errorMessage = error.attribute("description") ?? "";

  if (code >= 100 && code <= 199) {
    throw new ApiKeyException(errorMessage);
  }

  if (
    !indexerResponse.request.url.fullUri.includes("apikey=") &&
    (errorMessage === "Missing parameter" || errorMessage.includes("apikey"))
  ) {
    throw new ApiKeyException("Indexer requires an API key");
  }

  if (errorMessage === "Request limit reached") {
    throw new RequestLimitReachedException("API limit reached");
  }

  throw new NewznabException(indexerResponse, errorMessage);
}

/** Ported from NzbDrone.Core/Indexers/Newznab/NewznabRssParser.cs. */
export class NewznabRssParser extends RssParser {
  constructor(...args: ConstructorParameters<typeof RssParser>) {
    super(...args);
    this.preferredEnclosureMimeTypes = USENET_ENCLOSURE_MIME_TYPES;
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

    checkNewznabError(xdoc, indexerResponse);

    return true;
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
      !enclosureTypes.some((t) => USENET_ENCLOSURE_MIME_TYPES.includes(t ?? ""))
    ) {
      const torrentTypes = [
        "application/x-bittorrent",
        "application/x-bittorrent;x-scheme-handler/magnet",
      ];
      if (enclosureTypes.some((t) => torrentTypes.includes(t ?? ""))) {
        this.logger.warn(
          "%s does not contain application/x-nzb, found %s, did you intend to add a Torznab indexer?",
          indexerResponse.request.url,
          enclosureTypes[0]
        );
        return false;
      }

      this.logger.warn(
        "%s does not contain application/x-nzb, found %s.",
        indexerResponse.request.url,
        enclosureTypes[0]
      );
    }

    return true;
  }

  protected override processItemFields(item: XElement, releaseInfo: ReleaseInfo): ReleaseInfo {
    const result = super.processItemFields(item, releaseInfo);

    result.author = this.getAuthor(item);
    result.book = this.getBook(item);

    return result;
  }

  protected override getInfoUrl(item: XElement): string | null {
    return this.parseUrl(trimEndSuffix(tryGetValue(item, "comments"), "#comments"));
  }

  protected override getCommentUrl(item: XElement): string | null {
    return this.parseUrl(item.element("comments")?.value ?? null);
  }

  protected override getLanguages(item: XElement): Language[] {
    let languages = this.tryGetMultipleNewznabAttributes(item, "language");
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
    const sizeString = this.tryGetNewznabAttribute(item, "size");
    if (sizeString !== "" && !Number.isNaN(Number(sizeString))) {
      return Number.parseInt(sizeString, 10);
    }

    return this.getEnclosureLength(item);
  }

  protected override getPublishDate(item: XElement): Date {
    const dateString = this.tryGetNewznabAttribute(item, "usenetdate");
    if (dateString !== "") {
      return parseDate(dateString);
    }

    return super.getPublishDate(item);
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

  protected getAuthor(item: XElement): string {
    const authorString = this.tryGetNewznabAttribute(item, "author");
    return authorString !== "" ? authorString : "";
  }

  protected getBook(item: XElement): string {
    const bookString = this.tryGetNewznabAttribute(item, "booktitle");
    return bookString !== "" ? bookString : "";
  }

  protected tryGetNewznabAttribute(item: XElement, key: string, defaultValue = ""): string {
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

  protected tryGetMultipleNewznabAttributes(item: XElement, key: string): string[] {
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

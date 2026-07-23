import type { IHttpClient } from "../../http/HttpClient.js";
import { HttpAccept } from "../../http/HttpAccept.js";
import { HttpRequest } from "../../http/HttpRequest.js";
import type { HttpResponse } from "../../http/HttpResponse.js";
import { ApiKeyException } from "../exceptions/ApiKeyException.js";
import { IndexerRequest } from "../IndexerRequest.js";
import { IndexerResponse } from "../IndexerResponse.js";
import {
  createNewznabCapabilities,
  type NewznabCapabilities,
  type NewznabCategory,
} from "./NewznabCapabilities.js";
import { checkNewznabError } from "./NewznabRssParser.js";
import type { NewznabSettings } from "./newznabSettings.js";
import { XElement } from "../xml/XElement.js";

/** Minimal logger surface NewznabCapabilitiesProvider needs. */
export interface NewznabCapabilitiesProviderLogger {
  trace(message: string, ...args: unknown[]): void;
  debug(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

const noopLogger: NewznabCapabilitiesProviderLogger = {
  trace: () => {},
  debug: () => {},
  error: () => {},
};

const CAPS_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface INewznabCapabilitiesProvider {
  getCapabilities(settings: NewznabSettings): Promise<NewznabCapabilities>;
}

/**
 * Ported from NzbDrone.Core/Indexers/Newznab/NewznabCapabilitiesProvider.cs.
 *
 * DEVIATION -- caching: C#'s `ICacheManager.GetCache<T>(...)` (not-yet-ported
 * Common.Cache module) is replaced with a small private `Map`-backed TTL
 * cache local to this class, keyed the same way (`indexerSettings.ToJson()`
 * -- ported as `JSON.stringify(settings)`) with the same 7-day expiry. This
 * reproduces the cache's externally-observable behavior (the
 * `should_not_request_same_caps_twice` test from the C# fixture) without
 * pulling in the general-purpose cache-manager infrastructure, which is out
 * of this module's scope; a later phase porting `Common.Cache` can swap
 * this for a real `ICacheManager`-backed cache without changing this
 * class's public surface.
 *
 * DEVIATION -- sync vs async: C#'s `IHttpClient.Get()` is a blocking sync
 * call; this port's `IHttpClient` (http/HttpClient.ts) is async-only (see
 * that file's doc comment), so `getCapabilities()` is async here even
 * though the C# signature is not.
 */
export class NewznabCapabilitiesProvider implements INewznabCapabilitiesProvider {
  private readonly cache = new Map<string, { value: NewznabCapabilities; expiresAt: number }>();

  constructor(
    private readonly httpClient: IHttpClient,
    private readonly logger: NewznabCapabilitiesProviderLogger = noopLogger
  ) {}

  async getCapabilities(indexerSettings: NewznabSettings): Promise<NewznabCapabilities> {
    const key = JSON.stringify(indexerSettings);

    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }

    const capabilities = await this.fetchCapabilities(indexerSettings);
    this.cache.set(key, { value: capabilities, expiresAt: Date.now() + CAPS_CACHE_TTL_MS });

    return capabilities;
  }

  private async fetchCapabilities(indexerSettings: NewznabSettings): Promise<NewznabCapabilities> {
    let capabilities = createNewznabCapabilities();

    const trimmedBase = indexerSettings.baseUrl.replace(/\/+$/, "");
    const trimmedPath = indexerSettings.apiPath.replace(/\/+$/, "");
    let url = `${trimmedBase}${trimmedPath}?t=caps`;

    if (indexerSettings.apiKey && indexerSettings.apiKey.trim() !== "") {
      url += "&apikey=" + indexerSettings.apiKey;
    }

    const request = new HttpRequest(url, { httpAccept: HttpAccept.Rss });
    request.allowAutoRedirect = true;

    let response: HttpResponse;

    try {
      response = await this.httpClient.get(request);
    } catch (ex) {
      this.logger.debug(
        "Failed to get newznab api capabilities from %s: %s",
        indexerSettings.baseUrl,
        ex
      );
      throw ex;
    }

    try {
      capabilities = this.parseCapabilities(response);
    } catch (ex) {
      if (ex instanceof ApiKeyException) {
        this.logger.trace(
          "Unexpected Response content (%d bytes): %s",
          response.responseData?.length ?? 0,
          response.content
        );
        this.logger.debug(
          "Failed to parse newznab api capabilities for %s, invalid API key",
          indexerSettings.baseUrl
        );
        throw ex;
      }

      if (isXmlParseError(ex)) {
        this.logger.trace(
          "Unexpected Response content (%d bytes): %s",
          response.responseData?.length ?? 0,
          response.content
        );
        this.logger.debug(
          "Failed to parse newznab api capabilities for %s: %s",
          indexerSettings.baseUrl,
          ex
        );
        throw ex;
      }

      this.logger.trace(
        "Unexpected Response content (%d bytes): %s",
        response.responseData?.length ?? 0,
        response.content
      );
      this.logger.error(
        "Failed to determine newznab api capabilities for %s, using the defaults instead till Readarr restarts: %s",
        indexerSettings.baseUrl,
        ex
      );
    }

    return capabilities;
  }

  private parseCapabilities(response: HttpResponse): NewznabCapabilities {
    const capabilities = createNewznabCapabilities();

    let xmlRoot: XElement;
    try {
      xmlRoot = XElement.parse(response.content);
    } catch (ex) {
      throw new InvalidXmlError("Invalid XML", ex);
    }

    checkNewznabError(xmlRoot, new IndexerResponse(new IndexerRequest(response.request), response));

    if (xmlRoot.name !== "caps") {
      throw new InvalidXmlError("Unexpected XML");
    }

    const xmlLimits = xmlRoot.element("limits");
    if (xmlLimits !== null) {
      capabilities.defaultPageSize = Number.parseInt(xmlLimits.attribute("default") ?? "0", 10);
      capabilities.maxPageSize = Number.parseInt(xmlLimits.attribute("max") ?? "0", 10);
    }

    const xmlSearching = xmlRoot.element("searching");
    if (xmlSearching !== null) {
      const xmlBasicSearch = xmlSearching.element("search");
      if (xmlBasicSearch === null || xmlBasicSearch.attribute("available") !== "yes") {
        capabilities.supportedSearchParameters = null;
      } else if (xmlBasicSearch.attribute("supportedParams") !== null) {
        capabilities.supportedSearchParameters = xmlBasicSearch
          .attribute("supportedParams")!
          .split(",");
      }

      const xmlTvSearch = xmlSearching.element("tv-search");
      if (xmlTvSearch === null || xmlTvSearch.attribute("available") !== "yes") {
        capabilities.supportedTvSearchParameters = null;
      } else if (xmlTvSearch.attribute("supportedParams") !== null) {
        capabilities.supportedTvSearchParameters = xmlTvSearch
          .attribute("supportedParams")!
          .split(",");
        capabilities.supportsAggregateIdSearch = true;
      }

      const xmlAudioSearch = xmlSearching.element("book-search");
      if (xmlAudioSearch === null || xmlAudioSearch.attribute("available") !== "yes") {
        capabilities.supportedBookSearchParameters = null;
      } else if (xmlAudioSearch.attribute("supportedParams") !== null) {
        capabilities.supportedBookSearchParameters = xmlAudioSearch
          .attribute("supportedParams")!
          .split(",");
      }
    }

    const xmlCategories = xmlRoot.element("categories");
    if (xmlCategories !== null) {
      for (const xmlCategory of xmlCategories.elements("category")) {
        const cat: NewznabCategory = {
          id: Number.parseInt(xmlCategory.attribute("id") ?? "0", 10),
          name: xmlCategory.attribute("name") ?? "",
          description: xmlCategory.attribute("description") ?? "",
          subcategories: [],
        };

        for (const xmlSubcat of xmlCategory.elements("subcat")) {
          cat.subcategories.push({
            id: Number.parseInt(xmlSubcat.attribute("id") ?? "0", 10),
            name: xmlSubcat.attribute("name") ?? "",
            description: xmlSubcat.attribute("description") ?? "",
            subcategories: [],
          });
        }

        capabilities.categories.push(cat);
      }
    }

    return capabilities;
  }
}

/** Ported from the C# `System.Xml.XmlException` this module throws/catches. */
export class InvalidXmlError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, cause !== undefined ? { cause } : undefined);
    this.name = "InvalidXmlError";
    Object.setPrototypeOf(this, InvalidXmlError.prototype);
  }
}

function isXmlParseError(ex: unknown): boolean {
  return ex instanceof InvalidXmlError;
}

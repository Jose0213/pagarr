/**
 * Thin REST client for the OpenLibrary API
 * (https://openlibrary.org/dev/docs/api/search,
 * https://openlibrary.org/dev/docs/api/books): no auth required, JSON GET
 * endpoints. OpenLibrary asks API consumers to send a descriptive
 * User-Agent identifying the application (per their API etiquette docs) and
 * has no documented hard rate limit, but is known to throttle abusive
 * traffic -- this client sets a real User-Agent and lets 429s surface as
 * `MetadataProviderException` for the caller/priority chain to handle.
 *
 * Uses this repo's ported HttpClient (../../http) per the module brief.
 */

import type { IHttpClient } from "../../http/index.js";
import type { IMetadataRequestBuilder } from "../metadataRequestBuilder.js";
import { MetadataProviderException } from "../errors.js";

export const OPEN_LIBRARY_DEFAULT_BASE_URL = "https://openlibrary.org";
export const OPEN_LIBRARY_COVERS_BASE_URL = "https://covers.openlibrary.org";

export interface OpenLibraryClientOptions {
  userAgent?: string;
}

export class OpenLibraryClient {
  constructor(
    private readonly httpClient: IHttpClient,
    private readonly requestBuilder: IMetadataRequestBuilder,
    private readonly options: OpenLibraryClientOptions = {}
  ) {}

  async get<T>(resource: string, queryParams: Array<[string, string]> = []): Promise<T> {
    let builder = this.requestBuilder.getRequestBuilder().create().resource(resource);

    for (const [key, value] of queryParams) {
      builder = builder.addQueryParam(key, value);
    }

    const request = builder
      .setHeader(
        "User-Agent",
        this.options.userAgent ?? "Pagarr/1.0 (https://github.com/pagarr/pagarr)"
      )
      .build();

    request.suppressHttpError = true;

    const response = await this.httpClient.get(request);

    if (response.statusCode === 404) {
      throw new MetadataProviderException(
        "open-library",
        `OpenLibrary resource not found: ${resource}`
      );
    }

    if (response.statusCode === 429) {
      throw new MetadataProviderException("open-library", "OpenLibrary API rate limit exceeded.");
    }

    if (response.hasHttpError) {
      throw new MetadataProviderException(
        "open-library",
        `OpenLibrary API request failed with status ${response.statusCode}.`
      );
    }

    try {
      return JSON.parse(response.content) as T;
    } catch (cause) {
      throw new MetadataProviderException(
        "open-library",
        "OpenLibrary API returned a non-JSON response.",
        {
          cause,
        }
      );
    }
  }
}

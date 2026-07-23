/**
 * Thin REST client for the Google Books API v1
 * (https://developers.google.com/books/docs/v1/using):
 *  - `GET /volumes?q=...&key=...` -- search.
 *  - `GET /volumes/{volumeId}?key=...` -- fetch by id.
 * API key is optional for light/public usage but strongly recommended
 * (unauthenticated requests share a much lower quota); passed as a query
 * param, not a header, per Google's documented usage.
 *
 * Uses this repo's ported HttpClient (../../http) per the module brief.
 */

import type { IHttpClient } from "../../http/index.js";
import type { IMetadataRequestBuilder } from "../metadataRequestBuilder.js";
import { MetadataProviderException } from "../errors.js";

export const GOOGLE_BOOKS_DEFAULT_BASE_URL = "https://www.googleapis.com/books/v1";

export interface GoogleBooksClientOptions {
  /** Optional -- unauthenticated requests work but are quota-limited far more aggressively (Google's documented behavior for the public volumes.list/get methods). */
  apiKey?: string;
}

export class GoogleBooksClient {
  constructor(
    private readonly httpClient: IHttpClient,
    private readonly requestBuilder: IMetadataRequestBuilder,
    private readonly options: GoogleBooksClientOptions = {}
  ) {}

  async get<T>(resource: string, queryParams: Array<[string, string]> = []): Promise<T> {
    let builder = this.requestBuilder.getRequestBuilder().create().resource(resource);

    for (const [key, value] of queryParams) {
      builder = builder.addQueryParam(key, value);
    }

    if (this.options.apiKey !== undefined && this.options.apiKey !== "") {
      builder = builder.addQueryParam("key", this.options.apiKey);
    }

    const request = builder.build();
    request.suppressHttpError = true;

    const response = await this.httpClient.get(request);

    if (response.statusCode === 404) {
      throw new MetadataProviderException(
        "google-books",
        `Google Books resource not found: ${resource}`
      );
    }

    if (response.statusCode === 429 || response.statusCode === 403) {
      // Google Books returns 403 for quota-exceeded (not just permission
      // errors) on the public volumes endpoints -- surfaced the same as
      // 429 so callers/the fallback chain treat both as "provider is
      // throttling us right now."
      throw new MetadataProviderException(
        "google-books",
        "Google Books API quota/rate limit exceeded."
      );
    }

    if (response.hasHttpError) {
      throw new MetadataProviderException(
        "google-books",
        `Google Books API request failed with status ${response.statusCode}.`
      );
    }

    try {
      return JSON.parse(response.content) as T;
    } catch (cause) {
      throw new MetadataProviderException(
        "google-books",
        "Google Books API returned a non-JSON response.",
        {
          cause,
        }
      );
    }
  }
}

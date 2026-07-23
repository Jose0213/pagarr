/**
 * Thin GraphQL POST client for the Hardcover API
 * (https://docs.hardcover.app/api/getting-started/):
 *  - Endpoint: `https://api.hardcover.app/v1/graphql` (POST, JSON body
 *    `{ query, variables? }`).
 *  - Auth: `authorization` header carrying the user's API token verbatim
 *    (the docs example sends `Bearer <token>` as the header VALUE -- the
 *    header name itself is lowercase `authorization`, not the usual
 *    `Authorization: Bearer <token>` split).
 *  - Rate limit: 60 requests/minute (docs, "Limitations" section) -- see
 *    `provider.ts`'s use of `HttpRequestBuilder.withRateLimit`.
 *  - Errors: 401 invalid/expired token, 403 forbidden, 429 throttled, 500
 *    unknown (docs, "API Response Codes" table). GraphQL-level errors come
 *    back as HTTP 200 with an `errors` array in the body (standard GraphQL
 *    behavior) -- callers must check `body.errors` even on a 200.
 *
 * Uses this repo's ported HttpClient (../../http) rather than a
 * hand-rolled fetch call, per the module brief ("use the real ported
 * HttpClient... don't reimplement").
 */

import type { IHttpClient } from "../../http/index.js";
import type { IMetadataRequestBuilder } from "../metadataRequestBuilder.js";
import { MetadataProviderException } from "../errors.js";

export const HARDCOVER_DEFAULT_BASE_URL = "https://api.hardcover.app/v1";

export interface HardcoverClientOptions {
  /** API token from https://hardcover.app/account/api -- sent verbatim as the `authorization` header value (already includes any "Bearer " prefix the user copied). */
  apiToken: string;
  /**
   * Per the docs: "it is recommended to include a user-agent header with a
   * description of the script." Defaults to identifying Pagarr.
   */
  userAgent?: string;
}

export class HardcoverClient {
  constructor(
    private readonly httpClient: IHttpClient,
    private readonly requestBuilder: IMetadataRequestBuilder,
    private readonly options: HardcoverClientOptions
  ) {}

  async query<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
    const request = this.requestBuilder
      .getRequestBuilder()
      .create()
      .resource("graphql")
      .post()
      .setHeader("Content-Type", "application/json")
      .setHeader("authorization", this.options.apiToken)
      .setHeader(
        "User-Agent",
        this.options.userAgent ?? "Pagarr (https://github.com/pagarr/pagarr)"
      )
      .build();

    request.setContent(JSON.stringify(variables ? { query, variables } : { query }));
    request.suppressHttpError = true;

    const response = await this.httpClient.post(request);

    if (response.statusCode === 429) {
      throw new MetadataProviderException(
        "hardcover",
        "Hardcover API rate limit exceeded (60 req/min)."
      );
    }

    if (response.statusCode === 401) {
      throw new MetadataProviderException(
        "hardcover",
        "Hardcover API token is missing, invalid, or expired."
      );
    }

    if (response.hasHttpError) {
      throw new MetadataProviderException(
        "hardcover",
        `Hardcover API request failed with status ${response.statusCode}.`
      );
    }

    let body: { data?: T; errors?: Array<{ message: string }> };
    try {
      body = JSON.parse(response.content) as { data?: T; errors?: Array<{ message: string }> };
    } catch (cause) {
      throw new MetadataProviderException(
        "hardcover",
        "Hardcover API returned a non-JSON response.",
        { cause }
      );
    }

    if (body.errors && body.errors.length > 0) {
      throw new MetadataProviderException(
        "hardcover",
        `Hardcover GraphQL error: ${body.errors.map((e) => e.message).join("; ")}`
      );
    }

    if (body.data === undefined) {
      throw new MetadataProviderException("hardcover", "Hardcover API response missing 'data'.");
    }

    return body.data;
  }
}

// Ported from NzbDrone.Core/Http/CachedHttpResponseService.cs

import { HttpHeader } from "../HttpHeader.js";
import { HttpResponse, TypedHttpResponse } from "../HttpResponse.js";
import type { HttpRequest } from "../HttpRequest.js";
import type { IHttpClient } from "../HttpClient.js";
import type { HttpLogger } from "../HttpClient.js";
import type { ICachedHttpResponseRepository } from "./ICachedHttpResponseRepository.js";
import type { CachedHttpResponse } from "./CachedHttpResponse.js";

export interface ICachedHttpResponseService {
  get(request: HttpRequest, useCache: boolean, ttlMs: number): Promise<HttpResponse>;
  getTyped<T>(request: HttpRequest, useCache: boolean, ttlMs: number): Promise<TypedHttpResponse<T>>;
}

export class CachedHttpResponseService implements ICachedHttpResponseService {
  constructor(
    private readonly repo: ICachedHttpResponseRepository,
    private readonly httpClient: IHttpClient,
    private readonly logger: HttpLogger
  ) {}

  async get(request: HttpRequest, useCache: boolean, ttlMs: number): Promise<HttpResponse> {
    const cached = this.repo.findByUrl(request.url.toString());

    if (useCache && cached !== null && cached.expiry.getTime() > Date.now()) {
      this.logger.trace(`Returning cached response for [GET] ${request.url.toString()}`);
      return new HttpResponse(request, new HttpHeader(), cached.value, cached.statusCode);
    }

    const result = await this.httpClient.get(request);

    if (!result.hasHttpError) {
      const now = new Date();
      const entry: CachedHttpResponse = {
        id: cached?.id ?? 0,
        url: request.url.toString(),
        lastRefresh: now,
        expiry: new Date(now.getTime() + ttlMs),
        value: result.content,
        statusCode: result.statusCode,
      };

      this.repo.upsert(entry);
    }

    return result;
  }

  async getTyped<T>(request: HttpRequest, useCache: boolean, ttlMs: number): Promise<TypedHttpResponse<T>> {
    const response = await this.get(request, useCache, ttlMs);
    return new TypedHttpResponse<T>(response);
  }
}

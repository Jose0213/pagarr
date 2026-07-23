import type { HttpRequest } from "../http/HttpRequest.js";
import type { HttpResponse } from "../http/HttpResponse.js";
import type { IndexerRequest } from "./IndexerRequest.js";

/** Ported from NzbDrone.Core/Indexers/IndexerResponse.cs. */
export class IndexerResponse {
  readonly request: IndexerRequest;
  readonly httpResponse: HttpResponse;

  constructor(indexerRequest: IndexerRequest, httpResponse: HttpResponse) {
    this.request = indexerRequest;
    this.httpResponse = httpResponse;
  }

  get httpRequest(): HttpRequest {
    return this.httpResponse.request;
  }

  get content(): string {
    return this.httpResponse.content;
  }
}

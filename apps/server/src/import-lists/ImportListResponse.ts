import type { HttpRequest } from "../http/HttpRequest.js";
import type { HttpResponse } from "../http/HttpResponse.js";
import type { ImportListRequest } from "./ImportListRequest.js";

/**
 * Ported from NzbDrone.Core/ImportLists/ImportListResponse.cs.
 */
export class ImportListResponse {
  constructor(
    readonly request: ImportListRequest,
    readonly httpResponse: HttpResponse
  ) {}

  get httpRequest(): HttpRequest {
    return this.httpResponse.request;
  }

  get content(): string {
    return this.httpResponse.content;
  }
}

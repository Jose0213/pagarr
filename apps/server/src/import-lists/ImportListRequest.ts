import { HttpRequest } from "../http/HttpRequest.js";
import type { HttpAccept } from "../http/HttpAccept.js";
import type { HttpUri } from "../http/HttpUri.js";

/**
 * Ported from NzbDrone.Core/ImportLists/ImportListRequest.cs.
 */
export class ImportListRequest {
  readonly httpRequest: HttpRequest;

  constructor(urlOrRequest: string | HttpRequest, httpAccept?: HttpAccept) {
    this.httpRequest =
      urlOrRequest instanceof HttpRequest
        ? urlOrRequest
        : new HttpRequest(urlOrRequest, { httpAccept });
  }

  get url(): HttpUri {
    return this.httpRequest.url;
  }
}

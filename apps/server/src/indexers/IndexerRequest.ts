import { HttpRequest } from "../http/HttpRequest.js";
import type { HttpAccept } from "../http/HttpAccept.js";
import type { HttpUri } from "../http/HttpUri.js";

/** Ported from NzbDrone.Core/Indexers/IndexerRequest.cs. */
export class IndexerRequest {
  readonly httpRequest: HttpRequest;

  constructor(urlOrRequest: string | HttpRequest, httpAccept?: HttpAccept) {
    this.httpRequest =
      typeof urlOrRequest === "string"
        ? new HttpRequest(urlOrRequest, { httpAccept })
        : urlOrRequest;
  }

  get url(): HttpUri {
    return this.httpRequest.url;
  }
}

// Ported from NzbDrone.Core/Http/TorcacheHttpInterceptor.cs (class name
// typo "Torcache" in the filename, "TorCache" in the class -- kept the C#
// class name as-is).

import type { HttpRequest } from "./HttpRequest.js";
import type { HttpResponse } from "./HttpResponse.js";
import type { IHttpRequestInterceptor } from "./IHttpRequestInterceptor.js";

export class TorCacheHttpRequestInterceptor implements IHttpRequestInterceptor {
  preRequest(request: HttpRequest): HttpRequest {
    // torcache behaves strangely when it has query params and/or no Referer
    // or browser User-Agent. It's a bit vague, and we don't need the query
    // params. So we remove the query params and set a Referer to be safe.
    if (request.url.host === "torcache.net") {
      request.url = request.url.setQuery("");
      request.headers.add("Referer", `${request.url.scheme}://torcache.net/`);
    }

    return request;
  }

  postResponse(response: HttpResponse): HttpResponse {
    return response;
  }
}

// Ported from NzbDrone.Common/Http/IHttpRequestInterceptor.cs

import type { HttpRequest } from "./HttpRequest.js";
import type { HttpResponse } from "./HttpResponse.js";

export interface IHttpRequestInterceptor {
  preRequest(request: HttpRequest): HttpRequest;
  postResponse(response: HttpResponse): HttpResponse;
}

// Ported from NzbDrone.Common/Http/Dispatchers/IHttpDispatcher.cs

import type { HttpRequest } from "../HttpRequest.js";
import type { HttpResponse } from "../HttpResponse.js";
import type { CookieJar } from "../CookieJar.js";

export interface IHttpDispatcher {
  getResponse(request: HttpRequest, cookies: CookieJar): Promise<HttpResponse>;
}

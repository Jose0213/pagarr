// Ported from NzbDrone.Core/Http/CloudFlare/CloudFlareHttpInterceptor.cs

import { HttpUri } from "../HttpUri.js";
import type { HttpRequest } from "../HttpRequest.js";
import type { HttpResponse } from "../HttpResponse.js";
import type { IHttpRequestInterceptor } from "../IHttpRequestInterceptor.js";
import { CloudFlareCaptchaException } from "./CloudFlareCaptchaException.js";
import type { CloudFlareCaptchaRequest } from "./CloudFlareCaptchaRequest.js";
import type { HttpLogger } from "../HttpClient.js";

const CLOUDFLARE_CHALLENGE_SCRIPT = "cdn-cgi/scripts/cf.challenge.js";
const CLOUDFLARE_RE =
  /data-ray="(?<ray>[\w-]+)".*?data-sitekey="(?<siteKey>[\w-]+)".*?data-stoken="(?<secretToken>[\w-]+)"/s;

export class CloudFlareHttpInterceptor implements IHttpRequestInterceptor {
  constructor(private readonly logger: HttpLogger) {}

  preRequest(request: HttpRequest): HttpRequest {
    return request;
  }

  postResponse(response: HttpResponse): HttpResponse {
    if (response.statusCode === 403 && response.content.includes(CLOUDFLARE_CHALLENGE_SCRIPT)) {
      this.logger.trace("CloudFlare CAPTCHA block on %s", response.request.url.toString());
      throw new CloudFlareCaptchaException(response, this.createCaptchaRequest(response));
    }

    return response;
  }

  private createCaptchaRequest(response: HttpResponse): CloudFlareCaptchaRequest | null {
    const match = CLOUDFLARE_RE.exec(response.content);

    if (!match || !match.groups) {
      return null;
    }

    return {
      host: response.request.url.host,
      siteKey: match.groups.siteKey!,
      ray: match.groups.ray!,
      secretToken: match.groups.secretToken!,
      responseUrl: HttpUri.combine(response.request.url, new HttpUri("/cdn-cgi/l/chk_captcha")),
    };
  }
}

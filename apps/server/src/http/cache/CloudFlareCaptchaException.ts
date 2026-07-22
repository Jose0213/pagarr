// Ported from NzbDrone.Core/Http/CloudFlare/CloudFlareCaptchaException.cs

import type { HttpResponse } from "../HttpResponse.js";
import type { CloudFlareCaptchaRequest } from "./CloudFlareCaptchaRequest.js";

export class CloudFlareCaptchaException extends Error {
  readonly response: HttpResponse;
  readonly captchaRequest: CloudFlareCaptchaRequest | null;

  constructor(response: HttpResponse, captchaRequest: CloudFlareCaptchaRequest | null) {
    super(
      `Unable to access ${response.request.url.host}, blocked by CloudFlare CAPTCHA. Likely due to shared-IP VPN.`
    );
    this.name = "CloudFlareCaptchaException";
    this.response = response;
    this.captchaRequest = captchaRequest;

    Object.setPrototypeOf(this, CloudFlareCaptchaException.prototype);
  }

  get isExpired(): boolean {
    return this.response.request.cookies.has("cf_clearance");
  }
}

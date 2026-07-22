// Ported from NzbDrone.Core/Http/CloudFlare/CloudFlareCaptchaRequest.cs

import type { HttpUri } from "../HttpUri.js";

export interface CloudFlareCaptchaRequest {
  host: string;
  siteKey: string;
  ray: string;
  secretToken: string;
  responseUrl: HttpUri;
}

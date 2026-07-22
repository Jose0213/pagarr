// Ported from NzbDrone.Common/Http/Proxy/IHttpProxySettingsProvider.cs

import type { HttpUri } from "../HttpUri.js";
import type { HttpProxySettings } from "./HttpProxySettings.js";

export interface IHttpProxySettingsProvider {
  getProxySettingsForUri(uri: HttpUri): HttpProxySettings | null;
  getProxySettings(): HttpProxySettings | null;
}

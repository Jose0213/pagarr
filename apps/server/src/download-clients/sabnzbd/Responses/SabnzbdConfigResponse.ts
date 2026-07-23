import type { SabnzbdConfig } from "../SabnzbdCategory.js";

/** Ported from NzbDrone.Core/Download/Clients/Sabnzbd/Responses/SabnzbdConfigResponse.cs. */
export interface SabnzbdConfigResponse {
  config: SabnzbdConfig;
}

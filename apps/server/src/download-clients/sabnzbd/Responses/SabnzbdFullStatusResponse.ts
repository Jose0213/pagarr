import type { SabnzbdFullStatus } from "../SabnzbdFullStatus.js";

/** Ported from NzbDrone.Core/Download/Clients/Sabnzbd/Responses/SabnzbdFullStatusResponse.cs. */
export interface SabnzbdFullStatusResponse {
  status: SabnzbdFullStatus;
}

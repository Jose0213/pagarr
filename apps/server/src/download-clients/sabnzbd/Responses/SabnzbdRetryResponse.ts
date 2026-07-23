/**
 * Ported from NzbDrone.Core/Download/Clients/Sabnzbd/Responses/SabnzbdRetryResponse.cs.
 * `Status` has no explicit `[JsonProperty]` -- camelCase per this module's
 * casing note (see ../SabnzbdHistoryItem.ts's doc comment). `Id` is
 * explicitly mapped to the wire key `"nzo_id"`.
 */
export interface SabnzbdRetryResponse {
  status: boolean;
  nzo_id: string;
}

export function createSabnzbdRetryResponse(
  overrides: Partial<SabnzbdRetryResponse> = {}
): SabnzbdRetryResponse {
  return { status: false, nzo_id: "", ...overrides };
}

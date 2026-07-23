/**
 * Ported from NzbDrone.Core/Download/Clients/Sabnzbd/Responses/SabnzbdAddResponse.cs.
 * `Status` has no explicit `[JsonProperty]` -- camelCase per this module's
 * casing note (see ../SabnzbdHistoryItem.ts's doc comment). `Ids` is
 * explicitly mapped to the wire key `"nzo_ids"`.
 */
export interface SabnzbdAddResponse {
  status: boolean;
  nzo_ids: string[];
}

/** Ported from `SabnzbdAddResponse`'s default ctor (`Ids = new List<string>()`). */
export function createSabnzbdAddResponse(
  overrides: Partial<SabnzbdAddResponse> = {}
): SabnzbdAddResponse {
  return { status: false, nzo_ids: [], ...overrides };
}

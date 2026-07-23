/**
 * Ported from NzbDrone.Core/Download/Clients/Sabnzbd/Responses/SabnzbdVersionResponse.cs.
 * No explicit `[JsonProperty]` -- camelCase per this module's casing note
 * (see ../SabnzbdHistoryItem.ts's doc comment).
 */
export interface SabnzbdVersionResponse {
  version: string;
}

export function createSabnzbdVersionResponse(
  overrides: Partial<SabnzbdVersionResponse> = {}
): SabnzbdVersionResponse {
  return { version: "", ...overrides };
}

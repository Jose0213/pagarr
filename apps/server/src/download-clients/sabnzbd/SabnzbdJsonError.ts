/**
 * Ported from NzbDrone.Core/Download/Clients/Sabnzbd/SabnzbdJsonError.cs.
 * No explicit `[JsonProperty]` on either field -- camelCase per this
 * module's casing note (see SabnzbdHistoryItem.ts's doc comment).
 */
export interface SabnzbdJsonError {
  status: string;
  error: string;
}

export function createSabnzbdJsonError(
  overrides: Partial<SabnzbdJsonError> = {}
): SabnzbdJsonError {
  return { status: "", error: "", ...overrides };
}

/** Ported from `SabnzbdJsonError.Failed` (get-only): `Status` equals "false" (case-insensitive). */
export function sabnzbdJsonErrorFailed(error: SabnzbdJsonError): boolean {
  return Boolean(
    error.status && error.status.trim() !== "" && error.status.toLowerCase() === "false"
  );
}

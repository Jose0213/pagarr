/**
 * Ported from NzbDrone.Core/Notifications/Plex/PlexTv/PlexTvPinResponse.cs,
 * PlexTvPinUrlResponse.cs, PlexTvSignInUrlResponse.cs.
 */

export interface PlexTvPinResponse {
  id: number;
  code: string;
  authToken: string | null;
}

/** Ported from PlexTvPinResponse's default field values (all default(T) in C#: 0 / null / null). */
export function newPlexTvPinResponse(): PlexTvPinResponse {
  return { id: 0, code: "", authToken: null };
}

/**
 * Ported from PlexTvPinUrlResponse.cs. `Method` is a C# read-only property
 * that always returns `"POST"` (`public string Method => "POST";`) -- ported
 * as a literal-typed field with the same fixed value, not a mutable string.
 */
export interface PlexTvPinUrlResponse {
  url: string;
  readonly method: "POST";
  headers: Record<string, string>;
}

export interface PlexTvSignInUrlResponse {
  oauthUrl: string;
  pinId: number;
}

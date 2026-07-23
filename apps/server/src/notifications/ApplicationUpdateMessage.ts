/**
 * Ported from NzbDrone.Core/Notifications/ApplicationUpdateMessage.cs.
 *
 * C#'s `Version` (System.Version, a 4-part comparable version number) has no
 * built-in TS/Node equivalent -- ported as a plain `string` here (the
 * dotted-version text itself), matching how `messaging`'s own doc comments
 * establish "narrow to what's available, keep the shape" for BCL types
 * without a direct port. `toApplicationUpdateMessageString()` below
 * reproduces `ToString() => NewVersion.ToString()` against that string
 * representation directly (no reformatting needed, since a `Version`'s
 * `ToString()` and the dotted string it would be constructed from are the
 * same text).
 */
export interface ApplicationUpdateMessage {
  message: string;
  previousVersion: string;
  newVersion: string;
}

/** Ported from `ApplicationUpdateMessage.ToString()`: returns `NewVersion.ToString()`. */
export function applicationUpdateMessageToString(message: ApplicationUpdateMessage): string {
  return message.newVersion;
}

import type { SabnzbdHistoryItem } from "./SabnzbdHistoryItem.js";

/**
 * Ported from NzbDrone.Core/Download/Clients/Sabnzbd/SabnzbdHistory.cs.
 * `Paused` has no explicit `[JsonProperty]` -- camelCase per this module's
 * casing note (see SabnzbdHistoryItem.ts's doc comment). `Items` is
 * explicitly mapped to the wire key `"slots"`.
 */
export interface SabnzbdHistory {
  paused: boolean;
  slots: SabnzbdHistoryItem[];
}

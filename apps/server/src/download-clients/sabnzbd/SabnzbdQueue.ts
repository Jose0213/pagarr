import type { SabnzbdQueueItem } from "./SabnzbdQueueItem.js";

/**
 * Ported from NzbDrone.Core/Download/Clients/Sabnzbd/SabnzbdQueue.cs.
 * `Paused` has no explicit `[JsonProperty]` -- camelCase per this module's
 * casing note (see SabnzbdHistoryItem.ts's doc comment). `DefaultRootFolder`
 * is explicitly mapped to the wire key `"my_home"`; `Items` to `"slots"`.
 */
export interface SabnzbdQueue {
  /** Removed in Sabnzbd 2.0.0, see mode=fullstatus instead. */
  my_home: string;
  paused: boolean;
  slots: SabnzbdQueueItem[];
}

import type { SabnzbdDownloadStatus } from "./SabnzbdDownloadStatus.js";
import type { SabnzbdPriority } from "./SabnzbdPriority.js";

/**
 * Ported from NzbDrone.Core/Download/Clients/Sabnzbd/SabnzbdQueueItem.cs.
 *
 * `Status`/`Index`/`Priority`/`Percentage` have no explicit `[JsonProperty]`
 * -- camelCase per this module's casing note (see
 * SabnzbdHistoryItem.ts's doc comment). `Timeleft` is a
 * `[JsonConverter(typeof(SabnzbdQueueTimeConverter))]`-annotated `TimeSpan`
 * (converted at the parse boundary in Sabnzbd.ts, see
 * `parseQueueTimeMs()`/JsonConverters/sabnzbdQueueTimeConverter.ts) --
 * modeled here as the raw wire string (`"0:12:34"` / `"1:02:03:04"`), with
 * the parsed-to-milliseconds value computed by the caller. `Priority` is
 * similarly `[JsonConverter(typeof(SabnzbdPriorityTypeConverter))]` --
 * modeled as the raw wire string, parsed via
 * `sabnzbdPriorityFromWireName()`.
 */
export interface SabnzbdQueueItem {
  status: SabnzbdDownloadStatus;
  index: number;

  /** Raw wire value, e.g. `"0:12:34"` -- see this interface's doc comment. Parse via `parseSabnzbdQueueTime()`. */
  timeleft: string;

  mb: number;
  filename: string;

  /** Raw wire value (a `SabnzbdPriority` member name, e.g. `"Normal"`) -- see this interface's doc comment. Parse via `sabnzbdPriorityFromWireName()`. */
  priority: string;

  cat: string;
  mbleft: number;
  percentage: number;
  nzo_id: string;
}

export type { SabnzbdPriority };

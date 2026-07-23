import type { SabnzbdDownloadStatus } from "./SabnzbdDownloadStatus.js";

/**
 * Ported from NzbDrone.Core/Download/Clients/Sabnzbd/SabnzbdHistoryItem.cs.
 *
 * C#'s `Json.Deserialize` uses a `CamelCasePropertyNamesContractResolver`
 * (see `NzbDrone.Common/Serializer/Newtonsoft.Json/Json.cs`) for every
 * property without an explicit `[JsonProperty(PropertyName = "...")]`
 * override -- so `Category`/`Storage`/`Status` (no explicit attribute in the
 * C# source) actually round-trip as `category`/`storage`/`status` on the
 * wire, not PascalCase. Field names below are lowerCamelCase to match that
 * real wire shape; the explicitly-`[JsonProperty]`-annotated fields
 * (`fail_message`, `bytes`, `nzb_name`, `download_time`, `nzo_id`, `name`)
 * keep their literal annotated names.
 */
export interface SabnzbdHistoryItem {
  fail_message: string;
  bytes: number;
  category: string;
  nzb_name: string;
  download_time: number;
  storage: string;
  status: SabnzbdDownloadStatus;
  nzo_id: string;
  name: string;
}

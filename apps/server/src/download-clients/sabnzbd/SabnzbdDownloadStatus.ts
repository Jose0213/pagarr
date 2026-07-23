/**
 * Ported from NzbDrone.Core/Download/Clients/Sabnzbd/SabnzbdDownloadStatus.cs.
 *
 * C#'s `Json.Deserialize` (`NzbDrone.Common/Serializer/Newtonsoft.Json/Json.cs`)
 * registers a global `StringEnumConverter { NamingStrategy = new
 * CamelCaseNamingStrategy() }`, so this enum round-trips over the wire as
 * camelCase strings (`"grabbing"`, `"quickCheck"`, ...), not its C# PascalCase
 * member names or an integer. Values below match that actual wire format.
 */
export const SabnzbdDownloadStatus = {
  Grabbing: "grabbing",
  Queued: "queued",
  Paused: "paused",
  Checking: "checking",
  Downloading: "downloading",
  QuickCheck: "quickCheck",
  Verifying: "verifying",
  Repairing: "repairing",
  /** Fetching additional blocks. */
  Fetching: "fetching",
  Extracting: "extracting",
  Moving: "moving",
  /** Running PP Script. */
  Running: "running",
  Completed: "completed",
  Failed: "failed",
  Deleted: "deleted",
  Propagating: "propagating",
} as const;
export type SabnzbdDownloadStatus =
  (typeof SabnzbdDownloadStatus)[keyof typeof SabnzbdDownloadStatus];

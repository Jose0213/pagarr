/** Ported from NzbDrone.Core/MediaFiles/DeleteMediaFileReason.cs. */
export enum DeleteMediaFileReason {
  MissingFromDisk = "MissingFromDisk",
  Manual = "Manual",
  Upgrade = "Upgrade",
  NoLinkedEpisodes = "NoLinkedEpisodes",
  ManualOverride = "ManualOverride",
}

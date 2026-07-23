import type { IIndexerSettings } from "./IIndexerSettings.js";
import type { SeedCriteriaSettings } from "./SeedCriteriaSettings.js";

/** Ported from NzbDrone.Core/Indexers/ITorrentIndexerSettings.cs. */
export interface ITorrentIndexerSettings extends IIndexerSettings {
  minimumSeeders: number;
  seedCriteria: SeedCriteriaSettings;
  rejectBlocklistedTorrentHashesWhileGrabbing: boolean;
}

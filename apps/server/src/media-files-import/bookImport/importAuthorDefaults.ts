import type { MonitorTypes } from "../../books/index.js";

/**
 * Ported from NzbDrone.Core/MediaFiles/BookImport/ImportArtistDefaults.cs
 * (C# class name is `ImportAuthorDefaults` despite the file name --
 * ported here under the class's actual name for clarity). Not referenced
 * by any other in-scope file in the real source (dead code even in
 * upstream Readarr, likely a leftover from the Lidarr fork this was
 * adapted from) -- ported for structural completeness only.
 */
export interface ImportAuthorDefaults {
  metadataProfileId: number;
  languageProfileId: number;
  qualityProfileId: number;
  bookFolder: boolean;
  monitored: MonitorTypes;
  tags: Set<number>;
}

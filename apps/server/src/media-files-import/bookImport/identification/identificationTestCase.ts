import type { ParsedTrackInfo } from "../../../parser/model/parsedTrackInfo.js";

/**
 * Ported from NzbDrone.Core/MediaFiles/BookImport/Identification/IdentificationTestCase.cs.
 * `MetadataProfile` (NzbDrone.Core.Profiles.Metadata) is the real, already
 * ported `profiles/metadata/metadataProfile.ts` type -- imported directly,
 * not a forward-reference.
 */
import type { MetadataProfile } from "../../../profiles/metadata/metadataProfile.js";

export interface BasicLocalTrack {
  path: string;
  fileTrackInfo: ParsedTrackInfo;
}

export interface AuthorTestCase {
  author: string;
  metadataProfile: MetadataProfile;
}

export interface IdTestCase {
  expectedMusicBrainzReleaseIds: string[];
  libraryAuthors: AuthorTestCase[];
  author: string;
  book: string;
  release: string;
  newDownload: boolean;
  singleRelease: boolean;
  tracks: BasicLocalTrack[];
}

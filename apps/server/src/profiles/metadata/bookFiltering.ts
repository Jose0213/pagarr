/**
 * Local stand-ins for the parts of the not-yet-ported Books/MediaFiles
 * modules that NzbDrone.Core/Profiles/Metadata/MetadataProfileService.cs's
 * FilterBooks/FilterEditions actually read. Books is Phase 1 like Profiles
 * (parallel worktree, not landed) -- see qualityProfileService.ts's
 * identical collaborator-narrowing approach for the general pattern this
 * follows.
 *
 * Each interface here is deliberately narrowed to only the fields
 * FilterBooks/FilterEditions touch (see metadataProfileService.ts), not a
 * full port of Book/Edition/Author/SeriesBookLink/BookFile -- those real
 * types (from NzbDrone.Core/Books/Model/*.cs and
 * NzbDrone.Core/MediaFiles/BookFile.cs) have many more fields this module
 * has no reason to know about.
 */

/** Ported from NzbDrone.Core/Books/Ratings.cs: `Popularity => (double)Value * Votes`. */
export interface Ratings {
  votes: number;
  value: number;
}

export function popularity(ratings: Ratings): number {
  return ratings.value * ratings.votes;
}

/** Ported from NzbDrone.Core/Books/Model/AddBookOptions.cs. */
export enum BookAddType {
  Automatic = "Automatic",
  Manual = "Manual",
}

export interface FilterEdition {
  foreignEditionId: string;
  title: string;
  language: string | null;
  isbn13: string | null;
  asin: string | null;
  pageCount: number;
  manualAdd: boolean;
}

export interface FilterBook {
  foreignBookId: string;
  title: string;
  releaseDate: Date | null;
  ratings: Ratings;
  editions: FilterEdition[];
}

export interface LocalBook {
  foreignBookId: string;
  addType: BookAddType;
  editions: LocalEdition[];
}

export interface LocalEdition {
  foreignEditionId: string;
  manualAdd: boolean;
}

export interface LocalBookFile {
  editionForeignEditionId: string;
  bookForeignBookId: string;
}

export interface SeriesBookLink {
  book: FilterBook;
  position: string | null;
  isPrimary: boolean;
}

export interface AuthorSeries {
  linkItems: SeriesBookLink[];
}

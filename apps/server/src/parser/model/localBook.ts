import type { Author, Book, Edition } from "../../books/index.js";
import type { QualityModel } from "../../qualities/index.js";
import { IndexerFlags } from "./releaseInfo.js";
import type { ParsedBookInfo } from "./parsedBookInfo.js";
import type { ParsedTrackInfo } from "./parsedTrackInfo.js";

/**
 * Ported from NzbDrone.Core/Parser/Model/LocalBook.cs.
 *
 * Pure data shape -- referenced only by the not-yet-ported
 * `MediaFiles.BookImport.Identification` pipeline (Phase 3), not by any of
 * this module's real behavioral surface (Parser.cs / ParsingService.cs /
 * QualityParser.cs never construct or read a `LocalBook`). Ported now for
 * completeness of the 20-file Parser/Model tree, but two C# fields
 * reference types from modules not yet ported:
 *   - `AcoustIdResults` -> `string[]` (unaffected, plain list of strings).
 *   - `Distance` (`MediaFiles.BookImport.Identification.Distance`, a
 *     match-confidence scoring accumulator) -> typed `unknown` here as a
 *     narrow placeholder; Phase 3's real port should replace it with the
 *     real `Distance` type once that module lands.
 */
export interface LocalBook {
  path: string;
  calibreId: number;
  part: number;
  partCount: number;
  size: number;
  /** ISO-8601 timestamp string (C# `DateTime`). */
  modified: string;
  fileTrackInfo: ParsedTrackInfo | null;
  folderTrackInfo: ParsedBookInfo | null;
  downloadClientBookInfo: ParsedBookInfo | null;
  acoustIdResults: string[] | null;
  author: Author | null;
  book: Book | null;
  edition: Edition | null;
  /** See module doc comment: placeholder for `MediaFiles.BookImport.Identification.Distance` (not yet ported). */
  distance: unknown;
  quality: QualityModel | null;
  indexerFlags: IndexerFlags;
  existingFile: boolean;
  additionalFile: boolean;
  sceneSource: boolean;
  releaseGroup: string | null;
  sceneName: string | null;
}

export function newLocalBook(): LocalBook {
  return {
    path: "",
    calibreId: 0,
    part: 0,
    partCount: 0,
    size: 0,
    modified: new Date(0).toISOString(),
    fileTrackInfo: null,
    folderTrackInfo: null,
    downloadClientBookInfo: null,
    acoustIdResults: null,
    author: null,
    book: null,
    edition: null,
    distance: null,
    quality: null,
    indexerFlags: 0 as IndexerFlags,
    existingFile: false,
    additionalFile: false,
    sceneSource: false,
    releaseGroup: null,
    sceneName: null,
  };
}

/** Ported from `LocalBook.ToString() => Path`. */
export function localBookToString(localBook: LocalBook): string {
  return localBook.path;
}

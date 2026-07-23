import { qualityModelToString, type QualityModel } from "../../qualities/index.js";
import type { IsoCountry } from "../isoCountry.js";
import type { MediaInfoModel } from "./mediaInfoModel.js";

/**
 * Ported from NzbDrone.Core/Parser/Model/ParsedTrackInfo.cs.
 *
 * `AuthorTitle` is a computed property in C# (`Authors.FirstOrDefault()`,
 * not a stored field) -- ported as a function (`authorTitle()`) below
 * rather than a getter, matching this module's other computed-property
 * ports (see qualityModel.ts's `qualityModelToString`).
 *
 * `Duration` was a C# `TimeSpan`; ported as milliseconds (`number`), this
 * codebase's convention for durations elsewhere (no TimeSpan equivalent in
 * TS/JS).
 */
export interface ParsedTrackInfo {
  title: string | null;
  cleanTitle: string | null;
  authors: string[];
  bookTitle: string | null;
  seriesTitle: string | null;
  seriesIndex: string | null;
  isbn: string | null;
  asin: string | null;
  goodreadsId: string | null;
  authorMBId: string | null;
  bookMBId: string | null;
  releaseMBId: string | null;
  recordingMBId: string | null;
  trackMBId: string | null;
  discNumber: number;
  discCount: number;
  country: IsoCountry | null;
  year: number;
  publisher: string | null;
  label: string | null;
  source: string | null;
  catalogNumber: string | null;
  disambiguation: string | null;
  durationMs: number;
  quality: QualityModel | null;
  mediaInfo: MediaInfoModel | null;
  trackNumbers: number[];
  language: string | null;
  releaseGroup: string | null;
  releaseHash: string | null;
}

/** Ported from the `ParsedTrackInfo()` constructor: Authors/TrackNumbers default to empty collections, not null. */
export function newParsedTrackInfo(): ParsedTrackInfo {
  return {
    title: null,
    cleanTitle: null,
    authors: [],
    bookTitle: null,
    seriesTitle: null,
    seriesIndex: null,
    isbn: null,
    asin: null,
    goodreadsId: null,
    authorMBId: null,
    bookMBId: null,
    releaseMBId: null,
    recordingMBId: null,
    trackMBId: null,
    discNumber: 0,
    discCount: 0,
    country: null,
    year: 0,
    publisher: null,
    label: null,
    source: null,
    catalogNumber: null,
    disambiguation: null,
    durationMs: 0,
    quality: null,
    mediaInfo: null,
    trackNumbers: [],
    language: null,
    releaseGroup: null,
    releaseHash: null,
  };
}

/** Ported from `ParsedTrackInfo.AuthorTitle => Authors.FirstOrDefault()`. */
export function authorTitle(info: ParsedTrackInfo): string | undefined {
  return info.authors[0];
}

/**
 * Ported from `ParsedTrackInfo.ToString()`:
 * "{Authors joined by ' & '} - {BookTitle} - {DiscNumber}:{trackString} {Title}: {Quality}",
 * where trackString is "[Unknown Track]" when TrackNumbers is empty, else
 * TrackNumbers joined by "-" each zero-padded to 2 digits ("00" format).
 */
export function parsedTrackInfoToString(info: ParsedTrackInfo): string {
  const trackString =
    info.trackNumbers.length > 0
      ? info.trackNumbers.map((n) => String(n).padStart(2, "0")).join("-")
      : "[Unknown Track]";
  const qualityString = info.quality ? qualityModelToString(info.quality) : "";

  return `${info.authors.join(" & ")} - ${info.bookTitle} - ${info.discNumber}:${trackString} ${info.title}: ${qualityString}`;
}

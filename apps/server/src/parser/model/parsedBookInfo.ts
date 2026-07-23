import { qualityModelToString, type QualityModel } from "../../qualities/index.js";
import type { AuthorTitleInfo } from "./authorTitleInfo.js";

/**
 * Ported from NzbDrone.Core/Parser/Model/ParsedBookInfo.cs.
 *
 * C#'s `ExtraInfo` dictionary is `[JsonIgnore]` (never serialized) and
 * unused by anything in the ported Parser surface (`Parser.cs`/
 * `ParsingService.cs` never read or write it) -- kept here for shape
 * fidelity as a plain optional field rather than wired into any
 * serializer, matching the "not persisted" behavior.
 */
export interface ParsedBookInfo {
  bookTitle: string | null;
  authorName: string;
  authorTitleInfo: AuthorTitleInfo | null;
  quality: QualityModel | null;
  releaseDate: string | null;
  discography: boolean;
  discographyStart: number;
  discographyEnd: number;
  releaseGroup: string | null;
  releaseHash: string | null;
  releaseVersion: string | null;
  releaseTitle: string | null;
  extraInfo?: Record<string, unknown>;
}

/** Ported from ParsedBookInfo's implicit default field values (C# auto-properties default to null/false/0). */
export function newParsedBookInfo(): ParsedBookInfo {
  return {
    bookTitle: null,
    authorName: "",
    authorTitleInfo: null,
    quality: null,
    releaseDate: null,
    discography: false,
    discographyStart: 0,
    discographyEnd: 0,
    releaseGroup: null,
    releaseHash: null,
    releaseVersion: null,
    releaseTitle: null,
    extraInfo: {},
  };
}

/** Ported from ParsedBookInfo.ToString(): "{AuthorName} - {BookTitle} {Quality}" ("[Unknown Book]" when BookTitle is null). */
export function parsedBookInfoToString(info: ParsedBookInfo): string {
  const bookString = info.bookTitle !== null ? `${info.bookTitle}` : "[Unknown Book]";
  const qualityString = info.quality ? qualityModelToString(info.quality) : "";
  return `${info.authorName} - ${bookString} ${qualityString}`;
}

/**
 * Translates OpenLibrary's REST wire types (types.ts) into the
 * provider-agnostic DTOs in ../dto.ts. New code (not a C# port) -- see
 * ../interfaces.ts's module doc comment.
 */

import type {
  AuthorResourceDto,
  BookResourceDto,
  ContributorResourceDto,
  WorkResourceDto,
} from "../dto.js";
import type {
  OpenLibraryAuthor,
  OpenLibraryAuthorSearchDoc,
  OpenLibraryDescription,
  OpenLibraryEdition,
  OpenLibraryWork,
} from "./types.js";

const OPEN_LIBRARY_BASE = "https://openlibrary.org";

/** OpenLibrary keys are paths like "/works/OL27448W" or "/authors/OL34184A" -- the foreign id used throughout this module is the bare id ("OL27448W"), matching the last path segment. */
export function idFromKey(key: string): string {
  const segments = key.split("/").filter((s) => s !== "");
  return segments[segments.length - 1] ?? key;
}

export function coverUrl(coverId: number, size: "S" | "M" | "L" = "L"): string {
  return `https://covers.openlibrary.org/b/id/${coverId}-${size}.jpg`;
}

export function descriptionText(description: OpenLibraryDescription): string | null {
  if (description === undefined) {
    return null;
  }
  if (typeof description === "string") {
    return description;
  }
  return description.value;
}

export function toAuthorResourceDto(author: OpenLibraryAuthor): AuthorResourceDto {
  const id = idFromKey(author.key);
  return {
    foreignId: id,
    name: author.name,
    description: descriptionText(author.bio),
    imageUrl:
      author.photos && author.photos[0] !== undefined && author.photos[0] > 0
        ? coverUrl(author.photos[0])
        : null,
    url: `${OPEN_LIBRARY_BASE}${author.key}`,
    ratingCount: 0,
    averageRating: 0,
  };
}

export function toAuthorResourceDtoFromSearch(doc: OpenLibraryAuthorSearchDoc): AuthorResourceDto {
  const id = idFromKey(doc.key);
  return {
    foreignId: id,
    name: doc.name,
    description: null,
    imageUrl: null,
    url: `${OPEN_LIBRARY_BASE}${doc.key}`,
    ratingCount: 0,
    averageRating: 0,
  };
}

/** Ported-shape from BookInfoResource/ContributorResource: OpenLibrary's edition/work `authors` field is just a list of author-key references, with no per-book "role" -- everyone is treated as an "Author" contribution, matching how BookInfoProxy defaults contributor role when Goodreads doesn't supply one either. */
export function toContributorResourceDto(authorKey: string): ContributorResourceDto {
  return { foreignId: idFromKey(authorKey), role: "Author" };
}

export function toEditionResourceDto(
  edition: OpenLibraryEdition,
  authorKeys: string[]
): BookResourceDto {
  const isbn13 = edition.isbn_13?.[0] ?? null;

  return {
    foreignId: idFromKey(edition.key),
    asin: null,
    description: null,
    isbn13,
    title: edition.title,
    language: edition.languages?.[0] ? idFromKey(edition.languages[0].key) : null,
    format: edition.physical_format ?? null,
    editionInformation: null,
    publisher: edition.publishers?.[0] ?? null,
    imageUrl:
      edition.covers && edition.covers[0] !== undefined && edition.covers[0] > 0
        ? coverUrl(edition.covers[0])
        : null,
    isEbook: false,
    numPages: edition.number_of_pages ?? null,
    ratingCount: 0,
    averageRating: 0,
    url: `${OPEN_LIBRARY_BASE}${edition.key}`,
    releaseDate: parsePublishDate(edition.publish_date),
    contributors: authorKeys.map(toContributorResourceDto),
  };
}

export function toWorkResourceDto(
  work: OpenLibraryWork,
  editions: OpenLibraryEdition[],
  authors: OpenLibraryAuthor[]
): WorkResourceDto {
  const authorKeys = (work.authors ?? []).map((a) => a.author.key);

  return {
    foreignId: idFromKey(work.key),
    title: work.title,
    url: `${OPEN_LIBRARY_BASE}${work.key}`,
    releaseDate: parsePublishDate(work.first_publish_date),
    genres: (work.subjects ?? []).slice(0, 10),
    relatedWorks: [],
    books: editions.map((e) => toEditionResourceDto(e, authorKeys)),
    series: [],
    authors: authors.map(toAuthorResourceDto),
  };
}

/**
 * OpenLibrary's `publish_date`/`first_publish_date` fields are free-text
 * (e.g. "1954", "20 dezembro 2021", "March 1st 1994") rather than a
 * guaranteed ISO date -- unlike Hardcover/Google Books which return
 * proper `date`/`YYYY-MM-DD` values. This normalizes the two common cases
 * this module can parse with confidence (a bare 4-digit year, or an
 * already-ISO `YYYY-MM-DD`) and returns null for anything else rather than
 * guess at locale-specific date parsing.
 */
export function parsePublishDate(value: string | undefined): string | null {
  if (value === undefined) {
    return null;
  }

  const trimmed = value.trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  const yearMatch = /^\d{4}$/.exec(trimmed);
  if (yearMatch) {
    return `${trimmed}-01-01`;
  }

  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }

  return null;
}

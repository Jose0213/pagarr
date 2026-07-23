/**
 * Translates Google Books' REST wire types (types.ts) into the
 * provider-agnostic DTOs in ../dto.ts. New code (not a C# port) -- see
 * ../interfaces.ts's module doc comment, and types.ts's module doc comment
 * for why each Volume maps to a one-edition WorkResourceDto rather than
 * being grouped into a multi-edition work.
 */

import type {
  AuthorResourceDto,
  BookResourceDto,
  ContributorResourceDto,
  WorkResourceDto,
} from "../dto.js";
import { parsePublishDate } from "../open-library/mapper.js";
import type { GoogleBooksVolume } from "./types.js";

/**
 * Google Books assigns no stable per-author id in its public API --
 * `volumeInfo.authors` is a flat array of display names. Synthesizes a
 * stable-per-name foreign id (a slug of the name) so the same author
 * mentioned across multiple volume lookups maps to the same
 * `foreignAuthorId`, matching what AuthorMetadata/Author need for
 * dedup/upsert (see Books/models.ts's `foreignAuthorId` uniqueness).
 * Documented limitation: two different real-world authors who share
 * exactly the same display name will collide under this scheme -- Google
 * Books' public API gives no way to disambiguate them, so this is treated
 * as this provider's known ceiling, not something to paper over with a
 * fake random id (which would break re-lookup consistency instead).
 */
export function authorForeignId(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return `gb-author-${slug || "unknown"}`;
}

export function toContributorResourceDto(name: string): ContributorResourceDto {
  return { foreignId: authorForeignId(name), role: "Author" };
}

export function toAuthorResourceDto(name: string): AuthorResourceDto {
  return {
    foreignId: authorForeignId(name),
    name,
    description: null,
    imageUrl: null,
    url: null,
    ratingCount: 0,
    averageRating: 0,
  };
}

function bestIsbn13(volume: GoogleBooksVolume): string | null {
  const identifiers = volume.volumeInfo.industryIdentifiers ?? [];
  return identifiers.find((i) => i.type === "ISBN_13")?.identifier ?? null;
}

function bestImageUrl(volume: GoogleBooksVolume): string | null {
  const links = volume.volumeInfo.imageLinks;
  if (links === undefined) {
    return null;
  }
  // Prefer the largest available, matching how the other providers surface
  // one representative cover URL rather than the full imageLinks size set.
  return links.extraLarge ?? links.large ?? links.medium ?? links.small ?? links.thumbnail ?? null;
}

export function toEditionResourceDto(volume: GoogleBooksVolume): BookResourceDto {
  const authors = volume.volumeInfo.authors ?? [];

  return {
    foreignId: volume.id,
    asin: null,
    description: stripHtml(volume.volumeInfo.description ?? null),
    isbn13: bestIsbn13(volume),
    title: volume.volumeInfo.title,
    language: volume.volumeInfo.language ?? null,
    format: volume.volumeInfo.printType ?? null,
    editionInformation: volume.volumeInfo.subtitle ?? null,
    publisher: volume.volumeInfo.publisher ?? null,
    imageUrl: bestImageUrl(volume),
    isEbook: volume.saleInfo?.isEbook ?? false,
    numPages: volume.volumeInfo.pageCount ?? null,
    ratingCount: volume.volumeInfo.ratingsCount ?? 0,
    averageRating: volume.volumeInfo.averageRating ?? 0,
    url: volume.volumeInfo.canonicalVolumeLink ?? volume.volumeInfo.infoLink ?? null,
    releaseDate: parsePublishDate(volume.volumeInfo.publishedDate),
    contributors: authors.map(toContributorResourceDto),
  };
}

/** See types.ts's module doc comment: one Volume = one WorkResourceDto with a single edition. */
export function toWorkResourceDto(volume: GoogleBooksVolume): WorkResourceDto {
  const authors = volume.volumeInfo.authors ?? [];

  return {
    foreignId: volume.id,
    title: volume.volumeInfo.title,
    url: volume.volumeInfo.canonicalVolumeLink ?? volume.volumeInfo.infoLink ?? null,
    releaseDate: parsePublishDate(volume.volumeInfo.publishedDate),
    genres: volume.volumeInfo.categories ?? [],
    relatedWorks: [],
    books: [toEditionResourceDto(volume)],
    series: [],
    authors: authors.map(toAuthorResourceDto),
  };
}

/** Google Books' `description` field is HTML-formatted (per the docs: "includes simple formatting elements, such as b, i, and br tags"); strip tags for the plain-text `overview`/`description` fields the rest of this module expects. */
export function stripHtml(html: string | null): string | null {
  if (html === null) {
    return null;
  }
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .trim();
}

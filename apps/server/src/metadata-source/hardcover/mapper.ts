/**
 * Translates Hardcover's GraphQL wire types (types.ts) into the
 * provider-agnostic DTOs in ../dto.ts, which ../mapper.ts then turns into
 * Books/models.ts shapes. New code (not a C# port) -- see ../interfaces.ts's
 * module doc comment.
 */

import type {
  AuthorResourceDto,
  BookResourceDto,
  ContributorResourceDto,
  SeriesResourceDto,
  WorkResourceDto,
} from "../dto.js";
import type {
  HardcoverAuthor,
  HardcoverBook,
  HardcoverBookSeriesLink,
  HardcoverEdition,
} from "./types.js";

const HARDCOVER_BOOK_URL = "https://hardcover.app/books/";
const HARDCOVER_AUTHOR_URL = "https://hardcover.app/authors/";

export function toAuthorResourceDto(
  author: HardcoverAuthor,
  works?: WorkResourceDto[]
): AuthorResourceDto {
  return {
    foreignId: String(author.id),
    name: author.name,
    description: author.bio,
    imageUrl: author.image?.url ?? null,
    url:
      author.slug !== null && author.slug !== undefined
        ? `${HARDCOVER_AUTHOR_URL}${author.slug}`
        : null,
    ratingCount: 0,
    averageRating: 0,
    works,
  };
}

export function toContributorResourceDto(author: HardcoverAuthor): ContributorResourceDto {
  return { foreignId: String(author.id), role: "Author" };
}

export function toEditionResourceDto(
  edition: HardcoverEdition,
  fallbackContributors: HardcoverAuthor[]
): BookResourceDto {
  return {
    foreignId: String(edition.id),
    asin: edition.asin,
    description: null,
    isbn13: edition.isbn_13,
    title: edition.title ?? "",
    language: edition.language?.language ?? null,
    format: edition.edition_format ?? edition.physical_format,
    editionInformation: edition.edition_information,
    publisher: edition.publisher?.name ?? null,
    imageUrl: edition.image?.url ?? null,
    isEbook: (edition.reading_format?.format ?? "").toLowerCase() === "ebook",
    numPages: edition.pages,
    ratingCount: edition.users_count,
    averageRating: edition.rating ?? 0,
    url: null,
    releaseDate: edition.release_date,
    contributors: fallbackContributors.map(toContributorResourceDto),
  };
}

export function toSeriesResourceDto(
  link: HardcoverBookSeriesLink,
  foreignWorkId: string
): SeriesResourceDto {
  return {
    foreignId: String(link.series.id),
    title: link.series.name,
    description: link.series.description,
    linkItems: [
      {
        foreignWorkId,
        positionInSeries: link.details ?? (link.position !== null ? String(link.position) : null),
        seriesPosition: link.position ?? 0,
        primary: true,
      },
    ],
  };
}

export function toWorkResourceDto(book: HardcoverBook): WorkResourceDto {
  const contributors = book.contributions.map((c) => c.author);

  return {
    foreignId: String(book.id),
    title: book.title,
    url: book.slug !== null ? `${HARDCOVER_BOOK_URL}${book.slug}` : null,
    releaseDate: book.release_date,
    genres: [],
    relatedWorks: [],
    books: book.editions.map((edition) => toEditionResourceDto(edition, contributors)),
    series: book.book_series.map((link) => toSeriesResourceDto(link, String(book.id))),
    authors: contributors.map((a) => toAuthorResourceDto(a)),
  };
}

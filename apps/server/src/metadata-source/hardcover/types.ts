/**
 * Hardcover GraphQL API response shapes, per the public docs at
 * https://docs.hardcover.app/api/graphql/schemas/{books,editions,authors,series,contributions,images}/
 * (field names/types verified against the live docs site, July 2026 --
 * "Books", "Editions", "Authors", "Series", "Contributions", "Images"
 * reference pages). These are Hardcover-specific wire types, NOT the
 * provider-agnostic DTOs in ../dto.ts -- see hardcover/mapper.ts for the
 * translation between the two.
 *
 * This is new code written against Hardcover's public schema, not a port
 * of any Readarr/Goodreads/BookInfo C# type -- see interfaces.ts's module
 * doc comment (known-issues-fixlist.md #1) for why Hardcover replaces
 * Goodreads/BookInfo here rather than being ported from them.
 *
 * Only the fields this module actually reads are declared; Hardcover's
 * schema is much larger (contributions, characters, taggings, lists,
 * prompts, etc. -- see the Books schema's full field table) than what a
 * metadata client needs.
 */

export interface HardcoverImage {
  url: string;
  width?: number | null;
  height?: number | null;
}

export interface HardcoverPublisher {
  name: string;
}

export interface HardcoverLanguage {
  language: string;
}

export interface HardcoverReadingFormat {
  format: string;
}

export interface HardcoverAuthor {
  id: number;
  name: string;
  bio: string | null;
  slug: string | null;
  image: HardcoverImage | null;
  books_count: number;
  born_date: string | null;
  born_year: number | null;
  death_date: string | null;
  links: unknown;
}

export interface HardcoverContribution {
  contribution: string | null;
  author: HardcoverAuthor;
}

export interface HardcoverEdition {
  id: number;
  title: string | null;
  subtitle: string | null;
  isbn_10: string | null;
  isbn_13: string | null;
  asin: string | null;
  pages: number | null;
  release_date: string | null;
  edition_format: string | null;
  edition_information: string | null;
  physical_format: string | null;
  language: HardcoverLanguage | null;
  reading_format: HardcoverReadingFormat | null;
  publisher: HardcoverPublisher | null;
  image: HardcoverImage | null;
  rating: number | null;
  users_count: number;
}

export interface HardcoverBookSeriesLink {
  series: HardcoverSeries;
  position: number | null;
  details: string | null;
}

export interface HardcoverBook {
  id: number;
  title: string;
  subtitle: string | null;
  slug: string | null;
  description: string | null;
  release_date: string | null;
  release_year: number | null;
  pages: number | null;
  rating: number | null;
  ratings_count: number;
  image: HardcoverImage | null;
  links: unknown;
  contributions: HardcoverContribution[];
  editions: HardcoverEdition[];
  book_series: HardcoverBookSeriesLink[];
}

export interface HardcoverSeries {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  books_count: number;
  primary_books_count: number | null;
  author: HardcoverAuthor | null;
  book_series?: HardcoverBookSeriesLink[];
}

/** Response envelope for `query { books(...) { ... } }`. */
export interface HardcoverBooksQueryResponse {
  data?: {
    books: HardcoverBook[];
  };
  errors?: HardcoverGraphQLError[];
}

/** Response envelope for `query { authors(...) { ... } }`. */
export interface HardcoverAuthorsQueryResponse {
  data?: {
    authors: Array<
      HardcoverAuthor & {
        contributions: Array<{ book: HardcoverBook | null }>;
      }
    >;
  };
  errors?: HardcoverGraphQLError[];
}

/** Response envelope for `query { editions(...) { ... } }`. */
export interface HardcoverEditionsQueryResponse {
  data?: {
    editions: Array<HardcoverEdition & { book: HardcoverBook }>;
  };
  errors?: HardcoverGraphQLError[];
}

/**
 * Response envelope for the Typesense-backed `search(query, query_type,
 * per_page, page) { results }` query -- see
 * https://docs.hardcover.app/api/guides/searching/. `results` is a raw
 * Typesense response object; only `hits[].document` is used here (the
 * per-query_type document field lists are in that guide, e.g. Book:
 * title/isbns/author_names/slug/...).
 */
export interface HardcoverSearchQueryResponse {
  data?: {
    search: {
      results: {
        hits?: Array<{ document: Record<string, unknown> }>;
      } | null;
    };
  };
  errors?: HardcoverGraphQLError[];
}

export interface HardcoverGraphQLError {
  message: string;
  extensions?: Record<string, unknown>;
}

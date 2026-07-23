/**
 * OpenLibrary REST API response shapes
 * (https://openlibrary.org/dev/docs/api/search,
 * https://openlibrary.org/dev/docs/api/books -- the "Works API" and
 * "Search API" endpoints, both long-stable/documented public REST APIs, no
 * auth required). New code, not a C# port -- see ../interfaces.ts's module
 * doc comment.
 *
 * OpenLibrary has three relevant document shapes used here:
 *  - Search API (`/search.json`) `docs[]` entries -- flattened
 *    work-plus-best-edition summaries, used for title/author search.
 *  - Works API (`/works/{id}.json`) -- full work detail (description,
 *    subjects) fetched by work key.
 *  - Editions of a work (`/works/{id}/editions.json`) -- per-edition detail
 *    (ISBNs, publisher, format) not present in the flattened search summary.
 *  - Authors API (`/authors/{id}.json`) -- full author detail (bio, photo).
 *
 * Only the fields this module reads are declared.
 */

/** One entry in Search API's `docs[]` array. */
export interface OpenLibrarySearchDoc {
  /** Work key, e.g. "/works/OL27448W". */
  key: string;
  title: string;
  author_name?: string[];
  /** Author keys, e.g. ["/authors/OL34184A"], parallel-indexed with author_name. */
  author_key?: string[];
  first_publish_year?: number;
  /** Numeric id for https://covers.openlibrary.org/b/id/{cover_i}-L.jpg. */
  cover_i?: number;
  isbn?: string[];
  /** Edition keys, e.g. ["/books/OL7353617M"]. */
  edition_key?: string[];
  language?: string[];
  ratings_average?: number;
  ratings_count?: number;
  subject?: string[];
  number_of_pages_median?: number;
}

export interface OpenLibrarySearchResponse {
  start: number;
  num_found: number;
  docs: OpenLibrarySearchDoc[];
}

/** `description` on Works/Authors API responses is either a plain string or `{ type, value }`. */
export type OpenLibraryDescription = string | { type: string; value: string } | undefined;

/** Response shape of `/works/{id}.json`. */
export interface OpenLibraryWork {
  key: string;
  title: string;
  description?: OpenLibraryDescription;
  subjects?: string[];
  covers?: number[];
  first_publish_date?: string;
  authors?: Array<{ author: { key: string } }>;
}

/** Response shape of `/authors/{id}.json`. */
export interface OpenLibraryAuthor {
  key: string;
  name: string;
  bio?: OpenLibraryDescription;
  birth_date?: string;
  death_date?: string;
  photos?: number[];
  links?: Array<{ title?: string; url: string }>;
}

/** One entry in `/works/{id}/editions.json`'s `entries[]`. */
export interface OpenLibraryEdition {
  key: string;
  title: string;
  isbn_10?: string[];
  isbn_13?: string[];
  publishers?: string[];
  publish_date?: string;
  number_of_pages?: number;
  physical_format?: string;
  languages?: Array<{ key: string }>;
  covers?: number[];
}

export interface OpenLibraryEditionsResponse {
  entries: OpenLibraryEdition[];
}

/** Response shape of `/search/authors.json` (author search). */
export interface OpenLibraryAuthorSearchDoc {
  key: string;
  name: string;
  birth_date?: string;
  death_date?: string;
  top_work?: string;
  work_count?: number;
}

export interface OpenLibraryAuthorSearchResponse {
  numFound: number;
  docs: OpenLibraryAuthorSearchDoc[];
}

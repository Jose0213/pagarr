/**
 * Google Books API v1 response shapes
 * (https://developers.google.com/books/docs/v1/using,
 * https://developers.google.com/books/docs/v1/reference/volumes): public
 * `volumes.list` (search) and `volumes.get` (by id) endpoints, API-key
 * auth (query param `key=`), no OAuth needed for public data. New code,
 * not a C# port -- see ../interfaces.ts's module doc comment.
 *
 * Only the fields this module reads are declared (Volume has many more:
 * saleInfo, accessInfo, userInfo -- all irrelevant to metadata mapping).
 *
 * ## Shape mismatch vs. the other two providers (documented, not a bug)
 *
 * Google Books has no concept of a "work" distinct from its editions, and
 * no dedicated "author" entity with its own id/bio/photo -- `volumeInfo.
 * authors` is just a flat array of display-name strings. This means:
 *  - `google-books/mapper.ts`'s `toWorkResourceDto` treats each individual
 *    Volume as BOTH the work and its sole edition (a WorkResourceDto with
 *    exactly one BookResourceDto in its `books` array) rather than
 *    grouping multiple Volumes into one work the way Hardcover's `books`
 *    (with nested `editions`) or OpenLibrary's `works`+`editions.json`
 *    naturally do.
 *  - Author ids are synthesized from the author's name (see
 *    `authorForeignId` in mapper.ts) since Google Books assigns no stable
 *    author identifier in its public API.
 * This is Google Books' actual public data model, not a mapping shortcut
 * -- callers relying on Google Books as a *sole* source will see one
 * "work" per physical/digital edition rather than Hardcover/OpenLibrary's
 * grouped view, which is exactly why this module treats Google Books as
 * one participant in a fallback chain rather than a primary source (see
 * ../priorityMetadataService.ts).
 */

export interface GoogleBooksIndustryIdentifier {
  // The `| string` deliberately widens past the known literals: this is an
  // external API's response field, and Google Books can return identifier
  // types not in this list. The literals stay for their documentation/
  // autocomplete value even though `| string` alone would be an equivalent
  // type -- eslint-disable-next-line since that's exactly what
  // no-redundant-type-constituents flags and there's no behavior to fix.
  // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
  type: "ISBN_10" | "ISBN_13" | "ISSN" | "OTHER" | string;
  identifier: string;
}

export interface GoogleBooksImageLinks {
  smallThumbnail?: string;
  thumbnail?: string;
  small?: string;
  medium?: string;
  large?: string;
  extraLarge?: string;
}

export interface GoogleBooksVolumeInfo {
  title: string;
  subtitle?: string;
  authors?: string[];
  publisher?: string;
  /** Free-text, usually "YYYY-MM-DD" or "YYYY" or "YYYY-MM". */
  publishedDate?: string;
  /** HTML-formatted synopsis. */
  description?: string;
  industryIdentifiers?: GoogleBooksIndustryIdentifier[];
  pageCount?: number;
  categories?: string[];
  averageRating?: number;
  ratingsCount?: number;
  imageLinks?: GoogleBooksImageLinks;
  /** Two-letter ISO 639-1 code. */
  language?: string;
  infoLink?: string;
  canonicalVolumeLink?: string;
  // Same deliberate-widening rationale as GoogleBooksIndustryIdentifier.type above.
  // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
  printType?: "BOOK" | "MAGAZINE" | string;
}

export interface GoogleBooksSaleInfo {
  isEbook?: boolean;
}

export interface GoogleBooksVolume {
  id: string;
  volumeInfo: GoogleBooksVolumeInfo;
  saleInfo?: GoogleBooksSaleInfo;
}

export interface GoogleBooksVolumesListResponse {
  kind?: string;
  totalItems: number;
  items?: GoogleBooksVolume[];
}

/**
 * Ported from NzbDrone.Core/MetadataSource/BookInfo/BookInfoResource/*.cs
 * (AuthorResource, WorkResource, BookResource, SeriesResource,
 * ContributorResource) and, where BookInfo's shape was itself a thin
 * reshaping of a Goodreads resource, cross-checked against
 * NzbDrone.Core/MetadataSource/Goodreads/Resources/*.cs.
 *
 * See interfaces.ts's module doc comment for what "ported faithfully" means
 * for this module: these DTOs describe field-for-field what BookInfoProxy's
 * mapping functions (`MapAuthor`, `MapAuthorMetadata`, `MapBook`,
 * `MapEdition`, `MapSeries`) read off the wire and turn into
 * Books/models.ts's `Author`/`Book`/`Edition`/`Series`/`AuthorMetadata`.
 * Pagarr's three replacement providers (hardcover/, open-library/,
 * google-books/) each have their OWN wire-format types (Hardcover's
 * GraphQL response shape, OpenLibrary's search.json/works.json shape,
 * Google Books' volumes shape -- see each provider's `types.ts`) and each
 * provider's `mapper.ts` translates from that provider-specific wire shape
 * into these `*ResourceDto` types below, which stay provider-agnostic. This
 * keeps a single, faithful mapping target (matching what BookInfoProxy's
 * `MapAuthor`/`MapBook`/`MapEdition`/`MapSeries` produced) even though three
 * different upstream wire formats now feed into it.
 *
 * Field-level deviations, all mechanical:
 *  - C# `int ForeignId` -> `string foreignId` everywhere. Only Goodreads ids
 *    were integers; Hardcover ids are integers too but OpenLibrary work/
 *    edition keys ("OL27448W") and Google Books volume ids ("zyTCAlFPjgYC")
 *    are opaque strings. `models.ts`'s `foreignAuthorId`/`foreignBookId`/
 *    `foreignEditionId`/`foreignSeriesId` are already typed `string` for
 *    exactly this reason.
 *  - C# `DateTime?` -> `string | null` (ISO 8601 date), matching how
 *    `models.ts` stores `releaseDate` etc. as strings, not Date objects.
 *  - C# `double AverageRating` -> `number averageRating` (JS has one numeric
 *    type; no `decimal`/`double` split).
 */

/** Ported from BookInfo/BookInfoResource/ContributorResource.cs. */
export interface ContributorResourceDto {
  foreignId: string;
  role: string | null;
}

/** Ported from BookInfo/BookInfoResource/AuthorResource.cs. */
export interface AuthorResourceDto {
  foreignId: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  url: string | null;
  ratingCount: number;
  averageRating: number;
  works?: WorkResourceDto[];
  series?: SeriesResourceDto[];
}

/** Ported from BookInfo/BookInfoResource/WorkResource.cs. */
export interface WorkResourceDto {
  foreignId: string;
  title: string;
  url: string | null;
  releaseDate: string | null;
  genres: string[];
  relatedWorks: string[];
  books: BookResourceDto[];
  series: SeriesResourceDto[];
  authors: AuthorResourceDto[];
}

/** Ported from BookInfo/BookInfoResource/BookResource.cs (an "edition" resource, despite the C# class name -- see WorkResource.Books). */
export interface BookResourceDto {
  foreignId: string;
  asin: string | null;
  description: string | null;
  isbn13: string | null;
  title: string;
  language: string | null;
  format: string | null;
  editionInformation: string | null;
  publisher: string | null;
  imageUrl: string | null;
  isEbook: boolean;
  numPages: number | null;
  ratingCount: number;
  averageRating: number;
  url: string | null;
  releaseDate: string | null;
  contributors: ContributorResourceDto[];
}

/** Ported from BookInfo/BookInfoResource/SeriesResource.cs (SeriesResource + nested SeriesWorkLinkResource). */
export interface SeriesResourceDto {
  foreignId: string;
  title: string;
  description: string | null;
  linkItems: SeriesWorkLinkResourceDto[];
}

export interface SeriesWorkLinkResourceDto {
  foreignWorkId: string;
  positionInSeries: string | null;
  seriesPosition: number;
  primary: boolean;
}

/** Ported from BookInfo/BookInfoResource/BulkBookResource.cs -- batch search-by-ids response shape (Authors + Series + Works arrays sharing cross-references). */
export interface BulkBookResourceDto {
  authors: AuthorResourceDto[];
  series: SeriesResourceDto[];
  works: WorkResourceDto[];
}

/** Ported from BookInfo/BookInfoResource/RecentUpdatesResource.cs -- used by IProvideAuthorInfo.GetChangedAuthors. */
export interface RecentUpdatesResourceDto {
  limited: boolean;
  ids: string[];
}

/**
 * Ported from Goodreads/GoodreadsSearchProxy/Resources's search-result shape
 * (`SearchJsonResource` referenced by BookInfoProxy.Search / GoodreadsSearchProxy.Search).
 * Not one of the numbered `GoodreadsSearchProxy/Resources/*.cs` files read
 * verbatim -- BookInfoProxy consumes it only for `.WorkId`/`.BookId`/
 * `.Author.Id`, which is the shape kept here.
 */
export interface SearchResultDto {
  workId: string;
  bookId: string;
  author: { id: string };
}

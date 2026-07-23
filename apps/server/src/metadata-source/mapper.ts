/**
 * Ported from NzbDrone.Core/MetadataSource/BookInfo/BookInfoProxy.cs's
 * static mapping methods: `MapAuthorMetadata`, `MapAuthor`, `MapBook`,
 * `MapEdition`, `MapSeries`, `MapSeriesLinks`. These translate the
 * provider-agnostic DTOs (dto.ts) into Books/models.ts's `Author`/
 * `AuthorMetadata`/`Book`/`Edition`/`Series`/`SeriesBookLink` shapes --
 * unchanged in logic from the C# originals except:
 *
 *  - `ratingsPopularity`/`MaxBy(x => x.Ratings.Popularity)` for picking the
 *    "most popular" edition to monitor uses `ratingsPopularity()` from
 *    books/models.ts (already ported there) instead of re-deriving it.
 *  - `Parser.CleanAuthorName` / `.ToLastFirst()` / `.CleanSpaces()` calls
 *    are replaced by the textUtils.ts stand-ins -- see that file's doc
 *    comment for why (Parser module not yet ported).
 *  - No `book.Author.Value.Metadata = ...` mutation-through-lazy-wrapper;
 *    `authorMetadata` is set directly as a plain field (see models.ts's
 *    module doc comment on dropping LazyLoaded).
 *  - `AddDbIds` (reconciling freshly-mapped resources against existing DB
 *    rows via `_bookService.FindById`/`_authorService.FindById`) is NOT
 *    ported here -- it's a repository-touching side effect that belongs to
 *    whichever service calls a provider (AddAuthorService/RefreshAuthorService,
 *    both deferred -- see books/index.ts and this module's final report).
 *    These mapping functions are pure: DTO in, model out, no DB reads.
 */

import {
  AuthorStatusType,
  newAuthor,
  newAuthorMetadata,
  newBook,
  newEdition,
  ratingsPopularity,
  type Author,
  type AuthorMetadata,
  type Book,
  type Edition,
  type Links,
  type MediaCoverImage,
  type Series,
  type SeriesBookLink,
} from "../books/models.js";
import type { ITextMatcher } from "../books/textMatching.js";
import { cleanSpaces, toLastFirstPlaceholder } from "./textUtils.js";
import type {
  AuthorResourceDto,
  BookResourceDto,
  SeriesResourceDto,
  WorkResourceDto,
} from "./dto.js";

/** Ported from BookInfoProxy.MapAuthorMetadata(AuthorResource resource). */
export function mapAuthorMetadata(
  resource: AuthorResourceDto,
  sourceLinkName: string
): AuthorMetadata {
  const name = cleanSpaces(resource.name);
  const nameLastFirst = toLastFirstPlaceholder(name);

  const images: MediaCoverImage[] = [];
  if (isNotBlank(resource.imageUrl)) {
    images.push({ url: resource.imageUrl, coverType: "poster" });
  }

  const links: Links[] = [];
  if (isNotBlank(resource.url)) {
    links.push({ url: resource.url, name: sourceLinkName });
  }

  return {
    ...newAuthorMetadata(),
    foreignAuthorId: resource.foreignId,
    titleSlug: resource.foreignId,
    name,
    sortName: name.toLowerCase(),
    nameLastFirst,
    sortNameLastFirst: nameLastFirst.toLowerCase(),
    overview: resource.description,
    ratings: { votes: resource.ratingCount, value: resource.averageRating },
    status: AuthorStatusType.Continuing,
    images,
    links,
  };
}

/** Ported from BookInfoProxy.MapSeries(SeriesResource resource). */
export function mapSeries(resource: SeriesResourceDto): Series {
  return {
    id: 0,
    foreignSeriesId: resource.foreignId,
    title: resource.title,
    description: resource.description,
    numbered: false,
    workCount: 0,
    primaryWorkCount: 0,
  };
}

/** Ported from BookInfoProxy.MapEdition(BookResource resource). */
export function mapEdition(resource: BookResourceDto, sourceLinkName: string): Edition {
  const images: MediaCoverImage[] = [];
  if (isNotBlank(resource.imageUrl)) {
    images.push({ url: resource.imageUrl, coverType: "cover" });
  }

  const links: Links[] = [];
  if (isNotBlank(resource.url)) {
    links.push({ url: resource.url, name: `${sourceLinkName} Book` });
  }

  return {
    ...newEdition(),
    foreignEditionId: resource.foreignId,
    titleSlug: resource.foreignId,
    isbn13: resource.isbn13,
    asin: resource.asin,
    title: cleanSpaces(resource.title),
    language: resource.language,
    overview: resource.description ?? "",
    format: resource.format,
    isEbook: resource.isEbook,
    disambiguation: resource.editionInformation,
    publisher: resource.publisher,
    pageCount: resource.numPages ?? 0,
    releaseDate: resource.releaseDate,
    images,
    links,
    ratings: { votes: resource.ratingCount, value: resource.averageRating },
  };
}

/**
 * Ported from BookInfoProxy.MapBook(WorkResource resource). Deviation: C#
 * mutates a shared `Debug.Assert` invariant ("exactly one edition
 * monitored") that only fires in debug builds; ported as a no-op comment
 * since there's no direct TS equivalent and it's a dev-time sanity check,
 * not behavior.
 */
export function mapBook(resource: WorkResourceDto, sourceLinkName: string): Book {
  const editions = resource.books.map((b) => mapEdition(b, sourceLinkName));

  let title = resource.title;

  // Monitor the most popular edition (by Ratings.Popularity), matching
  // BookInfoProxy.MapBook's `book.Editions.Value.MaxBy(x => x.Ratings.Popularity)`.
  let mostPopular: Edition | undefined;
  for (const edition of editions) {
    if (
      mostPopular === undefined ||
      ratingsPopularity(edition.ratings) > ratingsPopularity(mostPopular.ratings)
    ) {
      mostPopular = edition;
    }
  }

  if (mostPopular !== undefined) {
    mostPopular.monitored = true;
    if (isBlankOrWhitespace(title)) {
      title = mostPopular.title;
    }
  }

  let releaseDate = resource.releaseDate;
  if (releaseDate === null) {
    // If we're missing the book's own release date, fall back to the
    // earliest edition release date -- preferring editions whose date
    // isn't a bare "January 1" placeholder, same two-pass fallback as
    // BookInfoProxy.MapBook.
    const nonJan1 = editions
      .filter((e) => e.releaseDate !== null && !isJanuaryFirst(e.releaseDate))
      .map((e) => e.releaseDate as string)
      .sort();

    if (nonJan1.length > 0) {
      releaseDate = nonJan1[0]!;
    } else {
      const anyDated = editions
        .filter((e) => e.releaseDate !== null)
        .map((e) => e.releaseDate as string)
        .sort();

      if (anyDated.length > 0) {
        releaseDate = anyDated[0]!;
      }
    }
  }

  const ratingVotes = editions.reduce((sum, e) => sum + e.ratings.votes, 0);
  const ratings =
    ratingVotes > 0
      ? {
          votes: ratingVotes,
          value:
            editions.reduce((sum, e) => sum + e.ratings.votes * e.ratings.value, 0) / ratingVotes,
        }
      : { votes: 0, value: 0 };

  const links: Links[] = [];
  if (isNotBlank(resource.url)) {
    links.push({ url: resource.url, name: `${sourceLinkName} Editions` });
  }

  return {
    ...newBook(),
    foreignBookId: resource.foreignId,
    titleSlug: resource.foreignId,
    title,
    cleanTitle: cleanSpaces(title).toLowerCase(),
    releaseDate,
    genres: resource.genres,
    relatedBooks: resource.relatedWorks.map((id) => Number(id)).filter((n) => !Number.isNaN(n)),
    links,
    editions,
    anyEditionOk: true,
    ratings,
  };
}

/**
 * Ported from BookInfoProxy.MapAuthor(AuthorResource resource): maps the
 * author's own metadata plus every work it authored (filtering to works
 * where this author is actually the primary contributor -- see
 * `getPrimaryAuthorId` below, ported from WorkResource's inline
 * `GetAuthorId` static helper).
 */
export function mapAuthor(
  resource: AuthorResourceDto,
  textMatcher: ITextMatcher,
  sourceLinkName: string
): Author {
  const metadata = mapAuthorMetadata(resource, sourceLinkName);

  const works = resource.works ?? [];
  const books = works
    .filter((w) => w.foreignId !== "" && getPrimaryAuthorId(w) === resource.foreignId)
    .map((w) => mapBook(w, sourceLinkName));

  for (const book of books) {
    book.authorMetadata = metadata;
  }

  const seriesResources = resource.series ?? [];
  const series = seriesResources.map(mapSeries);
  linkSeriesToBooks(series, books, seriesResources);

  return {
    ...newAuthor(),
    cleanName: textMatcher.cleanAuthorName(metadata.name),
    metadata,
    books,
    series,
  };
}

/**
 * Ported from BookInfoProxy.MapSeriesLinks(List<Series>, List<Book>,
 * List<SeriesResource>): builds SeriesBookLink rows joining the mapped
 * series to the mapped books, mutating each Book's `seriesLinks` in place
 * (matching the C# original's mutation of `book.SeriesLinks`).
 */
export function linkSeriesToBooks(
  series: Series[],
  books: Book[],
  resources: SeriesResourceDto[]
): void {
  const bookDict = new Map(books.map((b) => [b.foreignBookId, b]));
  const seriesDict = new Map(series.map((s) => [s.foreignSeriesId, s]));

  for (const book of books) {
    book.seriesLinks = [];
  }

  for (const resource of resources) {
    if (resource.linkItems.length === 0) {
      continue;
    }

    const currentSeries = seriesDict.get(resource.foreignId);
    if (currentSeries === undefined) {
      continue;
    }

    for (const linkItem of resource.linkItems) {
      if (linkItem.foreignWorkId === "" || !bookDict.has(linkItem.foreignWorkId)) {
        continue;
      }

      const book = bookDict.get(linkItem.foreignWorkId)!;

      const link: SeriesBookLink = {
        id: 0,
        book,
        series: currentSeries,
        isPrimary: linkItem.primary,
        position: linkItem.positionInSeries,
        seriesPosition: linkItem.seriesPosition,
        seriesId: currentSeries.id,
        bookId: book.id,
      };

      book.seriesLinks!.push(link);
    }
  }
}

/**
 * Ported from WorkResource's inline `GetAuthorId(WorkResource b)` static
 * helper on BookInfoProxy: picks the contributor of the edition with the
 * highest `ratingCount * averageRating` among editions that have any
 * contributors, and returns that edition's first contributor's foreign id.
 */
export function getPrimaryAuthorId(work: WorkResourceDto): string {
  let best: BookResourceDto | undefined;
  let bestScore = -Infinity;

  for (const edition of work.books) {
    if (edition.contributors.length === 0) {
      continue;
    }
    const score = edition.ratingCount * edition.averageRating;
    if (score > bestScore) {
      bestScore = score;
      best = edition;
    }
  }

  return best?.contributors[0]?.foreignId ?? "";
}

function isNotBlank(value: string | null | undefined): value is string {
  return value !== null && value !== undefined && value.trim() !== "";
}

function isBlankOrWhitespace(value: string): boolean {
  return value.trim() === "";
}

function isJanuaryFirst(isoDate: string): boolean {
  const match = /^\d{4}-(\d{2})-(\d{2})/.exec(isoDate);
  return match !== null && match[1] === "01" && match[2] === "01";
}

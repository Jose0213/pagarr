/**
 * Ported from NzbDrone.Core/Books/Model/*.cs.
 *
 * ## Deviations from the C# source (mechanical, not behavioral)
 *
 * - **`Entity<T>` base class.** C#'s `Entity<T> : ModelBase, IEquatable<T>`
 *   supplied `UseDbFieldsFrom`/`UseMetadataFrom`/`ApplyChanges` virtual hooks
 *   plus memberwise `Equals`/`GetHashCode` (via the `Equ` library) shared by
 *   every Books entity. TypeScript models here are plain data interfaces
 *   (matching this repo's `ModelBase` convention -- see db/model-base.ts),
 *   and the three "merge" behaviors are ported as free functions
 *   (`useDbFieldsFrom*`/`useMetadataFrom*`/`applyChanges*`) next to each
 *   model instead of instance methods, since TS interfaces carry no
 *   behavior. Memberwise equality (`Equals`/`GetHashCode`) is not ported --
 *   nothing in the ported service surface depends on object identity
 *   comparison; callers that need deep-equality can use any generic
 *   deep-equal utility.
 *
 * - **`LazyLoaded<T>`.** C# entities carried DB-relation fields
 *   (`Metadata`, `Author`, `Books`, `Editions`, etc.) as `LazyLoaded<T>`,
 *   a wrapper that fetched the related row from the DB on first access via
 *   reflection-driven join metadata (`Datastore/LazyLoaded.cs`). Phase 0's
 *   `BasicRepository` doesn't carry that reflection/join machinery (see its
 *   module doc comment), and Phase 1 has no query layer to auto-populate
 *   these lazily. These fields are ported as plain optional properties
 *   (`metadata?: AuthorMetadata`, `author?: Author`, etc.) that services
 *   populate explicitly by calling the relevant repository/service method
 *   -- e.g. `AuthorService.getAuthor()` returning just the `Authors` row,
 *   and callers that need `.metadata` fetching it themselves via
 *   `AuthorMetadataRepository`. This mirrors the *shape* of the C# model
 *   (same field names) without silently-magic lazy DB access.
 *
 * - **`ForeignAuthorId`/`Name` "compatibility properties" on `Author`, and
 *   `AuthorId` on `Book`.** These were C#-only convenience getters/setters
 *   proxying through `Metadata.Value`/`Author.Value`. Since `metadata`/
 *   `author` are plain optional fields here (not always populated), these
 *   aren't ported as properties; call sites read `author.metadata?.name`
 *   etc. directly.
 */

import type { ModelBase } from "../db/model-base.js";

// ---- Enums (Model/AuthorStatusType.cs, MonitorTypes.cs, NewItemMonitorTypes.cs) ----

/** Ported from Books/Model/AuthorStatusType.cs. Stored as an integer (0/1) in AuthorMetadata.Status. */
export enum AuthorStatusType {
  Continuing = 0,
  Ended = 1,
}

/** Ported from Books/Model/MonitorTypes.cs. Used only in-memory (AddAuthorOptions.Monitor), never persisted as its own column. */
export enum MonitorTypes {
  All = "All",
  Future = "Future",
  Missing = "Missing",
  Existing = "Existing",
  Latest = "Latest",
  First = "First",
  None = "None",
  Unknown = "Unknown",
}

/** Ported from Books/Model/NewItemMonitorTypes.cs. Stored as an integer in Authors.MonitorNewItems (enum ordinal: All=0, None=1, New=2). */
export enum NewItemMonitorTypes {
  All = 0,
  None = 1,
  New = 2,
}

/** Ported from Books/Model/AddBookOptions.cs's nested BookAddType enum. */
export enum BookAddType {
  Automatic = "Automatic",
  Manual = "Manual",
}

// ---- Embedded value objects (Model/Links.cs, Ratings.cs, MonitoringOptions.cs, AddAuthorOptions.cs, AddBookOptions.cs) ----

/** Ported from Books/Model/Links.cs. Embedded (JSON-serialized) in AuthorMetadata.Links / Book.Links / Edition.Links columns. */
export interface Links {
  url: string;
  name: string;
}

/**
 * Ported from Books/Model/Ratings.cs. Embedded (JSON-serialized) in
 * AuthorMetadata.Ratings / Book.Ratings / Edition.Ratings columns.
 * `popularity` is a computed property in C# (`(double)Value * Votes`, not
 * persisted) -- ported here as a function rather than a stored field to
 * keep the interface a plain data shape; see `ratingsPopularity()` below.
 */
export interface Ratings {
  votes: number;
  value: number;
}

/** Ported from Ratings.cs's `Popularity => (double)Value * Votes` computed property. */
export function ratingsPopularity(ratings: Ratings): number {
  return ratings.value * ratings.votes;
}

/** Ported from Books/Model/MonitoringOptions.cs. Embedded in Author.AddOptions (as AddAuthorOptions, which extends this). */
export interface MonitoringOptions {
  monitor: MonitorTypes;
  booksToMonitor: string[];
  monitored: boolean;
}

/** Ported from Books/Model/AddAuthorOptions.cs. Embedded (JSON-serialized) in Authors.AddOptions column. */
export interface AddAuthorOptions extends MonitoringOptions {
  searchForMissingBooks: boolean;
}

/** Ported from Books/Model/AddBookOptions.cs. Embedded (JSON-serialized) in Books.AddOptions column. C# default: AddType = Automatic. */
export interface AddBookOptions {
  addType: BookAddType;
  searchForNewBook: boolean;
}

export function newAddBookOptions(): AddBookOptions {
  return { addType: BookAddType.Automatic, searchForNewBook: false };
}

// ---- AuthorMetadata (Model/AuthorMetadata.cs) ----

/**
 * Ported from Books/Model/AuthorMetadata.cs. Backing table: AuthorMetadata.
 *
 * `sortName`/`nameLastFirst`/`sortNameLastFirst` are non-nullable `string`
 * in C# (declared type, pre-nullable-reference-types code) and the DB
 * columns are genuinely `NOT NULL` (see db/migrations/0013's table
 * rebuild) -- not `string | null` like most other text columns here.
 */
export interface AuthorMetadata extends ModelBase {
  foreignAuthorId: string;
  titleSlug: string;
  name: string;
  sortName: string;
  nameLastFirst: string;
  sortNameLastFirst: string;
  aliases: string[];
  overview: string | null;
  disambiguation: string | null;
  gender: string | null;
  hometown: string | null;
  born: string | null;
  died: string | null;
  status: AuthorStatusType;
  images: MediaCoverImage[];
  links: Links[];
  genres: string[];
  ratings: Ratings;
}

/**
 * Ported from Books/MediaCover/MediaCover.cs's `MediaCover` class as used by
 * AuthorMetadata.Images / Edition.Images (that module isn't in the Books
 * source directory -- MediaCover is a separate top-level NzbDrone.Core
 * module not yet ported -- so only the narrow shape actually stored in
 * these JSON columns is declared here).
 */
export interface MediaCoverImage {
  coverType: string;
  url: string;
  remoteUrl?: string;
}

export function newAuthorMetadata(): Omit<AuthorMetadata, keyof ModelBase> & { id: number } {
  return {
    id: 0,
    foreignAuthorId: "",
    titleSlug: "",
    name: "",
    sortName: "",
    nameLastFirst: "",
    sortNameLastFirst: "",
    aliases: [],
    overview: null,
    disambiguation: null,
    gender: null,
    hometown: null,
    born: null,
    died: null,
    status: AuthorStatusType.Continuing,
    images: [],
    links: [],
    genres: [],
    ratings: { votes: 0, value: 0 },
  };
}

/**
 * Ported from AuthorMetadata.UseMetadataFrom(AuthorMetadata other): merges
 * an incoming (freshly-fetched) metadata record onto an existing one,
 * preserving a few fields from `existing` when `other`'s value is
 * empty/zero (Overview when blank, Images when empty, Ratings when
 * Votes == 0) -- exactly the C# original's conditional-keep logic.
 */
export function useMetadataFromAuthorMetadata(existing: AuthorMetadata, other: AuthorMetadata): AuthorMetadata {
  return {
    ...existing,
    foreignAuthorId: other.foreignAuthorId,
    titleSlug: other.titleSlug,
    name: other.name,
    nameLastFirst: other.nameLastFirst,
    sortName: other.sortName,
    sortNameLastFirst: other.sortNameLastFirst,
    aliases: other.aliases,
    overview: isBlank(other.overview) ? existing.overview : other.overview,
    disambiguation: other.disambiguation,
    gender: other.gender,
    hometown: other.hometown,
    born: other.born,
    died: other.died,
    status: other.status,
    images: other.images.length > 0 ? other.images : existing.images,
    links: other.links,
    genres: other.genres,
    ratings: other.ratings.votes > 0 ? other.ratings : existing.ratings,
  };
}

function isBlank(value: string | null | undefined): boolean {
  return value === null || value === undefined || value.trim() === "";
}

// ---- Series (Model/Series.cs, SeriesBookLink.cs) ----

/** Ported from Books/Model/Series.cs. Backing table: Series. */
export interface Series extends ModelBase {
  foreignSeriesId: string;
  title: string;
  description: string | null;
  numbered: boolean;
  workCount: number;
  primaryWorkCount: number;
  /**
   * "A placeholder used in refresh only" per the C# comment -- not a DB
   * column (see migration 0001: the Series table has no ForeignAuthorId
   * column). Kept as an in-memory-only field for shape fidelity with
   * refresh-service code that isn't ported yet (RefreshSeriesService).
   */
  foreignAuthorId?: string;
}

/** Ported from Series.UseMetadataFrom(Series other). */
export function useMetadataFromSeries(existing: Series, other: Series): Series {
  return {
    ...existing,
    foreignSeriesId: other.foreignSeriesId,
    title: other.title,
    description: other.description,
    numbered: other.numbered,
    workCount: other.workCount,
    primaryWorkCount: other.primaryWorkCount,
  };
}

/** Ported from Books/Model/SeriesBookLink.cs. Backing table: SeriesBookLink. */
export interface SeriesBookLink extends ModelBase {
  position: string | null;
  seriesPosition: number;
  seriesId: number;
  bookId: number;
  isPrimary: boolean;
  series?: Series;
  book?: Book;
}

/** Ported from SeriesBookLink.UseMetadataFrom(SeriesBookLink other). */
export function useMetadataFromSeriesBookLink(existing: SeriesBookLink, other: SeriesBookLink): SeriesBookLink {
  return {
    ...existing,
    position: other.position,
    seriesPosition: other.seriesPosition,
    isPrimary: other.isPrimary,
  };
}

// ---- Book (Model/Book.cs) ----

/** Ported from Books/Model/Book.cs. Backing table: Books. */
export interface Book extends ModelBase {
  authorMetadataId: number;
  foreignBookId: string;
  /**
   * C# declares ForeignEditionId as a Book property but it is NOT a column
   * in the Books table (see migration 0001: Books has no ForeignEditionId
   * column -- only Editions.ForeignEditionId exists). It's populated
   * in-memory during add/refresh (e.g. AddBookService tracks which edition
   * the user picked) and never persisted on the Book row itself. Kept
   * optional here for the same reason -- shape fidelity, not a DB column.
   */
  foreignEditionId?: string;
  titleSlug: string;
  title: string;
  releaseDate: string | null;
  links: Links[];
  genres: string[];
  relatedBooks: number[];
  ratings: Ratings;
  lastSearchTime: string | null;
  cleanTitle: string;
  monitored: boolean;
  anyEditionOk: boolean;
  lastInfoSync: string | null;
  added: string | null;
  addOptions: AddBookOptions;

  // Dynamically-populated relations (see module doc comment on LazyLoaded).
  authorMetadata?: AuthorMetadata;
  author?: Author;
  editions?: Edition[];
  seriesLinks?: SeriesBookLink[];
}

/** Ported from Book.UseMetadataFrom(Book other). */
export function useMetadataFromBook(existing: Book, other: Book): Book {
  return {
    ...existing,
    foreignBookId: other.foreignBookId,
    foreignEditionId: other.foreignEditionId,
    titleSlug: other.titleSlug,
    title: other.title,
    releaseDate: other.releaseDate,
    links: other.links,
    genres: other.genres,
    relatedBooks: other.relatedBooks,
    ratings: other.ratings,
    cleanTitle: other.cleanTitle,
  };
}

/** Ported from Book.UseDbFieldsFrom(Book other): pulls the DB-owned identity/config fields from an existing stored row onto a fresh one. */
export function useDbFieldsFromBook(incoming: Book, existing: Book): Book {
  return {
    ...incoming,
    id: existing.id,
    authorMetadataId: existing.authorMetadataId,
    monitored: existing.monitored,
    anyEditionOk: existing.anyEditionOk,
    lastInfoSync: existing.lastInfoSync,
    lastSearchTime: existing.lastSearchTime,
    added: existing.added,
    addOptions: existing.addOptions,
  };
}

/** Ported from Book.ApplyChanges(Book other). */
export function applyChangesBook(existing: Book, other: Book): Book {
  return {
    ...existing,
    foreignBookId: other.foreignBookId,
    foreignEditionId: other.foreignEditionId,
    addOptions: other.addOptions,
    monitored: other.monitored,
    anyEditionOk: other.anyEditionOk,
  };
}

export function newBook(): Omit<Book, keyof ModelBase> & { id: number } {
  return {
    id: 0,
    authorMetadataId: 0,
    foreignBookId: "",
    titleSlug: "",
    title: "",
    releaseDate: null,
    links: [],
    genres: [],
    relatedBooks: [],
    ratings: { votes: 0, value: 0 },
    lastSearchTime: null,
    cleanTitle: "",
    monitored: false,
    anyEditionOk: false,
    lastInfoSync: null,
    added: null,
    addOptions: newAddBookOptions(),
  };
}

// ---- Edition (Model/Edition.cs) ----

/** Ported from Books/Model/Edition.cs. Backing table: Editions. */
export interface Edition extends ModelBase {
  bookId: number;
  foreignEditionId: string;
  titleSlug: string;
  isbn13: string | null;
  asin: string | null;
  title: string;
  language: string | null;
  /** C# default: `string.Empty` (Edition()'s constructor). Column is nullable; the ctor default is a shape-fidelity detail preserved by newEdition() below. */
  overview: string;
  format: string | null;
  isEbook: boolean;
  disambiguation: string | null;
  publisher: string | null;
  pageCount: number;
  releaseDate: string | null;
  images: MediaCoverImage[];
  links: Links[];
  ratings: Ratings;
  monitored: boolean;
  manualAdd: boolean;

  book?: Book;
}

/** Ported from Edition.UseMetadataFrom(Edition other). */
export function useMetadataFromEdition(existing: Edition, other: Edition): Edition {
  return {
    ...existing,
    foreignEditionId: other.foreignEditionId,
    titleSlug: other.titleSlug,
    isbn13: other.isbn13,
    asin: other.asin,
    title: other.title,
    language: other.language,
    overview: isBlank(other.overview) ? existing.overview : other.overview,
    format: other.format,
    isEbook: other.isEbook,
    disambiguation: other.disambiguation,
    publisher: other.publisher,
    pageCount: other.pageCount,
    releaseDate: other.releaseDate,
    images: other.images.length > 0 ? other.images : existing.images,
    links: other.links,
    ratings: other.ratings,
  };
}

/** Ported from Edition.UseDbFieldsFrom(Edition other). */
export function useDbFieldsFromEdition(incoming: Edition, existing: Edition): Edition {
  return {
    ...incoming,
    id: existing.id,
    bookId: existing.bookId,
    book: existing.book,
    monitored: existing.monitored,
    manualAdd: existing.manualAdd,
  };
}

/** Ported from Edition.ApplyChanges(Edition other). */
export function applyChangesEdition(existing: Edition, other: Edition): Edition {
  return {
    ...existing,
    foreignEditionId: other.foreignEditionId,
    monitored: other.monitored,
  };
}

export function newEdition(): Omit<Edition, keyof ModelBase> & { id: number } {
  return {
    id: 0,
    bookId: 0,
    foreignEditionId: "",
    titleSlug: "",
    isbn13: null,
    asin: null,
    title: "",
    language: null,
    overview: "",
    format: null,
    isEbook: false,
    disambiguation: null,
    publisher: null,
    pageCount: 0,
    releaseDate: null,
    images: [],
    links: [],
    ratings: { votes: 0, value: 0 },
    monitored: false,
    manualAdd: false,
  };
}

// ---- Author (Model/Author.cs) ----

/** Ported from Books/Model/Author.cs. Backing table: Authors. */
export interface Author extends ModelBase {
  authorMetadataId: number;
  cleanName: string;
  monitored: boolean;
  monitorNewItems: NewItemMonitorTypes;
  lastInfoSync: string | null;
  path: string;
  /**
   * NOT a column on the Authors table (see migration 0001: no
   * RootFolderPath column exists there -- only ImportLists has one). This
   * is a genuine quirk of the real Readarr schema: `Author.RootFolderPath`
   * is populated in-memory (by whatever constructs an Author for add/move)
   * and read by AuthorPathBuilder/AddAuthorService, but never round-trips
   * through the DB. Preserved faithfully as an in-memory-only field, not
   * "fixed" into a persisted column (that's known-issue-fixlist territory,
   * out of scope for this port per PORT_PLAN.md).
   */
  rootFolderPath: string;
  added: string | null;
  qualityProfileId: number;
  metadataProfileId: number;
  tags: number[];
  addOptions?: AddAuthorOptions;

  metadata?: AuthorMetadata;
  books?: Book[];
  series?: Series[];
}

/** Ported from Author.UseMetadataFrom(Author other): only CleanName carries over. */
export function useMetadataFromAuthor(existing: Author, other: Author): Author {
  return { ...existing, cleanName: other.cleanName };
}

/** Ported from Author.UseDbFieldsFrom(Author other). */
export function useDbFieldsFromAuthor(incoming: Author, existing: Author): Author {
  return {
    ...incoming,
    id: existing.id,
    authorMetadataId: existing.authorMetadataId,
    monitored: existing.monitored,
    monitorNewItems: existing.monitorNewItems,
    lastInfoSync: existing.lastInfoSync,
    path: existing.path,
    rootFolderPath: existing.rootFolderPath,
    added: existing.added,
    qualityProfileId: existing.qualityProfileId,
    metadataProfileId: existing.metadataProfileId,
    tags: existing.tags,
    addOptions: existing.addOptions,
  };
}

/** Ported from Author.ApplyChanges(Author other). */
export function applyChangesAuthor(existing: Author, other: Author): Author {
  return {
    ...existing,
    path: other.path,
    qualityProfileId: other.qualityProfileId,
    books: other.books,
    tags: other.tags,
    addOptions: other.addOptions,
    rootFolderPath: other.rootFolderPath,
    monitored: other.monitored,
    monitorNewItems: other.monitorNewItems,
    metadataProfileId: other.metadataProfileId,
  };
}

export function newAuthor(): Omit<Author, keyof ModelBase> & { id: number } {
  return {
    id: 0,
    authorMetadataId: 0,
    cleanName: "",
    monitored: false,
    monitorNewItems: NewItemMonitorTypes.All,
    lastInfoSync: null,
    path: "",
    rootFolderPath: "",
    added: null,
    qualityProfileId: 0,
    metadataProfileId: 0,
    tags: [],
  };
}

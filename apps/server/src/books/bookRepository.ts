/**
 * Ported from NzbDrone.Core/Books/Repositories/BookRepository.cs.
 *
 * Backing table: Books (migration 0001 + 0016's RelatedBooks column + 0039's
 * LastSearchTime column).
 *
 * ## Deviations
 *
 * - No SqlBuilder join layer -- see authorRepository.ts's module doc comment
 *   for the general shape of this deviation. Methods that joined in C# use
 *   hand-written parameterized SQL here.
 * - `BooksWhereCutoffUnmet` (C#) is NOT ported: it depends on
 *   `IQualityProfileService`/`QualitiesBelowCutoff` from the Profiles/
 *   Qualities module (PORT_PLAN.md Phase 1, a sibling module not present in
 *   this worktree). `BookCutoffService` (the only caller) is likewise not
 *   ported for the same reason -- see this module's final report.
 * - `BooksWithoutFiles` and `GetAuthorBooksWithFiles` join against
 *   `BookFiles`/`Editions` using raw SQL (both tables already exist per
 *   the ported migrations) rather than a ported `BookFile` TS model, since
 *   MediaFiles (the module that owns `BookFile`) is Phase 3, not yet
 *   ported. Only the columns actually needed (`Id`, `EditionId`) are
 *   referenced.
 * - JSON-embedded columns (Links, Genres, Ratings, AddOptions,
 *   RelatedBooks): same issue and fix as authorMetadataRepository.ts's
 *   module doc comment -- `BasicRepository`'s inherited generic CRUD
 *   methods (get/find/insert/update/etc, called directly by BookService for
 *   simple by-id lookups) are overridden here to serialize/deserialize at
 *   the boundary. The custom raw-SQL query methods below (getBooks,
 *   findById, etc.) already JSON.parse manually in `rowToBook`.
 */

import type { DatabaseSync, SQLInputValue } from "node:sqlite";
import type { IDatabase } from "../db/database.js";
import { BasicRepository, type ColumnMapping } from "../db/basic-repository.js";
import type { IEventAggregator } from "../db/events.js";
import { PagingSpec, SortDirection } from "../db/paging-spec.js";
import { toSqlValue } from "../db/sql-value.js";
import { BookAddType, type Author, type Book } from "./models.js";

const BOOK_COLUMNS: ColumnMapping<Book>[] = [
  { prop: "authorMetadataId", column: "AuthorMetadataId" },
  { prop: "foreignBookId", column: "ForeignBookId" },
  { prop: "titleSlug", column: "TitleSlug" },
  { prop: "title", column: "Title" },
  { prop: "releaseDate", column: "ReleaseDate" },
  { prop: "links", column: "Links" },
  { prop: "genres", column: "Genres" },
  { prop: "ratings", column: "Ratings" },
  { prop: "cleanTitle", column: "CleanTitle" },
  { prop: "monitored", column: "Monitored", type: "boolean" },
  { prop: "anyEditionOk", column: "AnyEditionOk", type: "boolean" },
  { prop: "lastInfoSync", column: "LastInfoSync" },
  { prop: "added", column: "Added" },
  { prop: "addOptions", column: "AddOptions" },
  { prop: "relatedBooks", column: "RelatedBooks" },
  { prop: "lastSearchTime", column: "LastSearchTime" },
];

/** Serializes the JSON-embedded fields to strings, ready for BasicRepository's toSqlValue-based binding. */
function serialize(model: Book): Book {
  return {
    ...model,
    links: JSON.stringify(model.links) as unknown as Book["links"],
    genres: JSON.stringify(model.genres) as unknown as string[],
    ratings: JSON.stringify(model.ratings) as unknown as Book["ratings"],
    addOptions: JSON.stringify(model.addOptions) as unknown as Book["addOptions"],
    relatedBooks: JSON.stringify(model.relatedBooks) as unknown as number[],
  };
}

/** Deserializes the JSON-embedded fields back from the strings BasicRepository read off the row. */
function deserialize(model: Book): Book {
  return {
    ...model,
    links: parseOr(model.links as unknown as string, []),
    genres: parseOr(model.genres as unknown as string, []),
    ratings: parseOr(model.ratings as unknown as string, { votes: 0, value: 0 }),
    addOptions: parseOr(model.addOptions as unknown as string, {
      addType: BookAddType.Automatic,
      searchForNewBook: false,
    }),
    relatedBooks: parseOr(model.relatedBooks as unknown as string, []),
  };
}

function parseOr<T>(value: string | null | undefined, fallback: T): T {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }
  if (typeof value !== "string") {
    return value as unknown as T;
  }
  return JSON.parse(value) as T;
}

export class BookRepository extends BasicRepository<Book> {
  constructor(database: IDatabase, eventAggregator?: IEventAggregator) {
    super(database, { tableName: "Books", columns: BOOK_COLUMNS, eventAggregator });
  }

  private db(): DatabaseSync {
    return this.database.openConnection();
  }

  override all(): Book[] {
    return super.all().map(deserialize);
  }

  override find(id: number): Book | undefined {
    const model = super.find(id);
    return model ? deserialize(model) : undefined;
  }

  override get(id: number): Book {
    return deserialize(super.get(id));
  }

  override getMany(ids: number[]): Book[] {
    return super.getMany(ids).map(deserialize);
  }

  override single(): Book {
    return deserialize(super.single());
  }

  override singleOrDefault(): Book | undefined {
    const model = super.singleOrDefault();
    return model ? deserialize(model) : undefined;
  }

  override insert(model: Book): Book {
    return deserialize(super.insert(serialize(model)));
  }

  override insertMany(models: Book[]): Book[] {
    return super.insertMany(models.map(serialize)).map(deserialize);
  }

  override update(model: Book): Book {
    return deserialize(super.update(serialize(model)));
  }

  override updateMany(models: Book[]): void {
    super.updateMany(models.map(serialize));
  }

  override upsert(model: Book): Book {
    return deserialize(super.upsert(serialize(model)));
  }

  override setFields(model: Book, properties: (Exclude<keyof Book, "id"> & string)[]): void {
    super.setFields(serialize(model), properties);
  }

  private rowToBook(row: Record<string, unknown>): Book {
    return {
      id: row["Id"] as number,
      authorMetadataId: row["AuthorMetadataId"] as number,
      foreignBookId: row["ForeignBookId"] as string,
      titleSlug: row["TitleSlug"] as string,
      title: row["Title"] as string,
      releaseDate: row["ReleaseDate"] as string | null,
      links: row["Links"] ? JSON.parse(row["Links"] as string) : [],
      genres: row["Genres"] ? JSON.parse(row["Genres"] as string) : [],
      ratings: row["Ratings"] ? JSON.parse(row["Ratings"] as string) : { votes: 0, value: 0 },
      cleanTitle: row["CleanTitle"] as string,
      monitored: Boolean(row["Monitored"]),
      anyEditionOk: Boolean(row["AnyEditionOk"]),
      lastInfoSync: row["LastInfoSync"] as string | null,
      added: row["Added"] as string | null,
      addOptions: row["AddOptions"]
        ? JSON.parse(row["AddOptions"] as string)
        : { addType: BookAddType.Automatic, searchForNewBook: false },
      relatedBooks: row["RelatedBooks"] ? JSON.parse(row["RelatedBooks"] as string) : [],
      lastSearchTime: (row["LastSearchTime"] as string | null) ?? null,
    };
  }

  /** Ported from BookRepository.GetBooks(int authorId): joins Books -> Authors on AuthorMetadataId, filters Authors.Id. */
  getBooks(authorId: number): Book[] {
    const sql = `
      SELECT "Books".* FROM "Books"
      JOIN "Authors" ON "Books"."AuthorMetadataId" = "Authors"."AuthorMetadataId"
      WHERE "Authors"."Id" = ?
    `;
    const rows = this.db().prepare(sql).all(authorId) as Record<string, unknown>[];
    return rows.map((r) => this.rowToBook(r));
  }

  /**
   * Ported from BookRepository.GetLastBooks(IEnumerable<int> authorMetadataIds):
   * for each author, the most-recently-released book with ReleaseDate in
   * the past (MIN(Id) tiebreak on the MAX(ReleaseDate) per author, matching
   * the C# inner/outer subquery join).
   */
  getLastBooks(authorMetadataIds: number[]): Book[] {
    if (authorMetadataIds.length === 0) {
      return [];
    }
    const now = new Date().toISOString();
    const placeholders = authorMetadataIds.map(() => "?").join(", ");
    const sql = `
      SELECT "Books".* FROM "Books"
      JOIN (
        SELECT MIN("Id") as id, MAX("ReleaseDate") as date
        FROM "Books"
        WHERE "AuthorMetadataId" IN (${placeholders}) AND "ReleaseDate" < ?
        GROUP BY "AuthorMetadataId"
      ) ids ON ids.id = "Books"."Id" AND ids.date = "Books"."ReleaseDate"
    `;
    const rows = this.db()
      .prepare(sql)
      .all(...authorMetadataIds.map((id) => toSqlValue(id)), now) as Record<string, unknown>[];
    return rows.map((r) => this.rowToBook(r));
  }

  /** Ported from BookRepository.GetNextBooks(IEnumerable<int> authorMetadataIds): mirror of getLastBooks for future releases. */
  getNextBooks(authorMetadataIds: number[]): Book[] {
    if (authorMetadataIds.length === 0) {
      return [];
    }
    const now = new Date().toISOString();
    const placeholders = authorMetadataIds.map(() => "?").join(", ");
    const sql = `
      SELECT "Books".* FROM "Books"
      JOIN (
        SELECT MIN("Id") as id, MIN("ReleaseDate") as date
        FROM "Books"
        WHERE "AuthorMetadataId" IN (${placeholders}) AND "ReleaseDate" > ?
        GROUP BY "AuthorMetadataId"
      ) ids ON ids.id = "Books"."Id" AND ids.date = "Books"."ReleaseDate"
    `;
    const rows = this.db()
      .prepare(sql)
      .all(...authorMetadataIds.map((id) => toSqlValue(id)), now) as Record<string, unknown>[];
    return rows.map((r) => this.rowToBook(r));
  }

  /** Ported from BookRepository.GetBooksByAuthorMetadataId(int authorMetadataId): `Query(s => s.AuthorMetadataId == authorMetadataId)`. */
  getBooksByAuthorMetadataId(authorMetadataId: number): Book[] {
    const rows = this.db()
      .prepare('SELECT * FROM "Books" WHERE "AuthorMetadataId" = ?')
      .all(authorMetadataId) as Record<string, unknown>[];
    return rows.map((r) => this.rowToBook(r));
  }

  /** Ported from BookRepository.GetBooksForRefresh(int authorMetadataId, List<string> foreignIds). */
  getBooksForRefresh(authorMetadataId: number, foreignIds: string[]): Book[] {
    if (foreignIds.length === 0) {
      const rows = this.db()
        .prepare('SELECT * FROM "Books" WHERE "AuthorMetadataId" = ?')
        .all(authorMetadataId) as Record<string, unknown>[];
      return rows.map((r) => this.rowToBook(r));
    }
    const placeholders = foreignIds.map(() => "?").join(", ");
    const sql = `SELECT * FROM "Books" WHERE "AuthorMetadataId" = ? OR "ForeignBookId" IN (${placeholders})`;
    const rows = this.db()
      .prepare(sql)
      .all(authorMetadataId, ...foreignIds) as Record<string, unknown>[];
    return rows.map((r) => this.rowToBook(r));
  }

  /** Ported from BookRepository.GetBooksByFileIds(IEnumerable<int> fileIds): Books -> Editions -> BookFiles, distinct by Book id. */
  getBooksByFileIds(fileIds: number[]): Book[] {
    if (fileIds.length === 0) {
      return [];
    }
    const placeholders = fileIds.map(() => "?").join(", ");
    const sql = `
      SELECT DISTINCT "Books".* FROM "Books"
      JOIN "Editions" ON "Books"."Id" = "Editions"."BookId"
      JOIN "BookFiles" ON "Editions"."Id" = "BookFiles"."EditionId"
      WHERE "BookFiles"."Id" IN (${placeholders})
    `;
    const rows = this.db()
      .prepare(sql)
      .all(...fileIds.map((id) => toSqlValue(id))) as Record<string, unknown>[];
    return rows.map((r) => this.rowToBook(r));
  }

  /** Ported from BookRepository.FindById(string foreignBookId): `Query(s => s.ForeignBookId == foreignBookId).SingleOrDefault()`. */
  findById(foreignBookId: string): Book | undefined {
    const row = this.db().prepare('SELECT * FROM "Books" WHERE "ForeignBookId" = ?').get(foreignBookId) as
      | Record<string, unknown>
      | undefined;
    return row ? this.rowToBook(row) : undefined;
  }

  /** Ported from BookRepository.FindBySlug(string titleSlug): `Query(s => s.TitleSlug == titleSlug).SingleOrDefault()`. */
  findBySlug(titleSlug: string): Book | undefined {
    const row = this.db().prepare('SELECT * FROM "Books" WHERE "TitleSlug" = ?').get(titleSlug) as
      | Record<string, unknown>
      | undefined;
    return row ? this.rowToBook(row) : undefined;
  }

  /**
   * Ported from BookRepository.FindByTitle(int authorMetadataId, string
   * title): C# first cleans `title` via `Parser.CleanAuthorName` (falling
   * back to the raw title if that produces an empty string), then does an
   * ExclusiveOrDefault match on CleanTitle-or-Title + AuthorMetadataId.
   *
   * Deviation: `Parser.CleanAuthorName` (title-cleaning/normalization) is
   * Parser-module logic (Phase 2, not yet ported -- see models.ts's module
   * doc comment for the same dependency issue on FuzzyMatch/CleanAuthorName
   * elsewhere in Books). This takes the clean-title value as a parameter
   * instead of importing the cleaning function, so callers (BookService)
   * inject it -- see bookService.ts.
   */
  findByTitle(authorMetadataId: number, title: string, cleanTitle: string): Book | undefined {
    const rows = this.db()
      .prepare(
        'SELECT * FROM "Books" WHERE ("CleanTitle" = ? OR "Title" = ?) AND "AuthorMetadataId" = ?'
      )
      .all(cleanTitle, title, authorMetadataId) as Record<string, unknown>[];
    return rows.length === 1 ? this.rowToBook(rows[0]!) : undefined;
  }

  /**
   * Ported from BookRepository.BooksWithoutFiles(PagingSpec<Book>
   * pagingSpec): books whose current monitored edition has no BookFile,
   * joined through Authors/AuthorMetadata/Editions, filtered to
   * ReleaseDate <= now. Ordering/paging matches BasicRepository.GetPaged's
   * semantics (see db/basic-repository.ts).
   */
  booksWithoutFiles(pagingSpec: PagingSpec<Book>): PagingSpec<Book> {
    const now = new Date().toISOString();
    const baseSql = `
      FROM "Books"
      JOIN "Authors" ON "Books"."AuthorMetadataId" = "Authors"."AuthorMetadataId"
      JOIN "AuthorMetadata" ON "Authors"."AuthorMetadataId" = "AuthorMetadata"."Id"
      JOIN "Editions" ON "Books"."Id" = "Editions"."BookId"
      LEFT JOIN "BookFiles" ON "Editions"."Id" = "BookFiles"."EditionId"
      WHERE "BookFiles"."Id" IS NULL AND "Editions"."Monitored" = 1 AND "Books"."ReleaseDate" <= ?
    `;

    const sortColumn = pagingSpec.sortKey ? `"Books"."${columnForSortKey(pagingSpec.sortKey)}"` : `"Books"."Id"`;
    const direction = pagingSpec.sortDirection === SortDirection.Descending ? "DESC" : "ASC";
    const pageOffset = Math.max(pagingSpec.page - 1, 0) * pagingSpec.pageSize;

    const recordsSql = `SELECT DISTINCT "Books".* ${baseSql} ORDER BY ${sortColumn} ${direction} LIMIT ? OFFSET ?`;
    const rows = this.db().prepare(recordsSql).all(now, pagingSpec.pageSize, pageOffset) as Record<
      string,
      unknown
    >[];

    const countSql = `SELECT COUNT(DISTINCT "Books"."Id") as count ${baseSql}`;
    const countRow = this.db().prepare(countSql).get(now) as { count: number };

    pagingSpec.records = rows.map((r) => this.rowToBook(r));
    pagingSpec.totalRecords = countRow.count;

    return pagingSpec;
  }

  /** Ported from BookRepository.BooksBetweenDates(DateTime startDate, DateTime endDate, bool includeUnmonitored). */
  booksBetweenDates(startDate: string, endDate: string, includeUnmonitored: boolean): Book[] {
    let sql = 'SELECT "Books".* FROM "Books"';
    const params: SQLInputValue[] = [];

    if (!includeUnmonitored) {
      sql += ' JOIN "Authors" ON "Books"."AuthorMetadataId" = "Authors"."AuthorMetadataId"';
    }

    sql += ' WHERE "Books"."ReleaseDate" >= ? AND "Books"."ReleaseDate" <= ?';
    params.push(startDate, endDate);

    if (!includeUnmonitored) {
      sql += ' AND "Books"."Monitored" = 1 AND "Authors"."Monitored" = 1';
    }

    const rows = this.db()
      .prepare(sql)
      .all(...params) as Record<string, unknown>[];
    return rows.map((r) => this.rowToBook(r));
  }

  /** Ported from BookRepository.AuthorBooksBetweenDates(Author author, DateTime startDate, DateTime endDate, bool includeUnmonitored). */
  authorBooksBetweenDates(author: Author, startDate: string, endDate: string, includeUnmonitored: boolean): Book[] {
    let sql = 'SELECT "Books".* FROM "Books"';
    const params: SQLInputValue[] = [];

    if (!includeUnmonitored) {
      sql += ' JOIN "Authors" ON "Books"."AuthorMetadataId" = "Authors"."AuthorMetadataId"';
    }

    sql += ' WHERE "Books"."ReleaseDate" >= ? AND "Books"."ReleaseDate" <= ? AND "Books"."AuthorMetadataId" = ?';
    params.push(startDate, endDate, author.authorMetadataId);

    if (!includeUnmonitored) {
      sql += ' AND "Books"."Monitored" = 1 AND "Authors"."Monitored" = 1';
    }

    const rows = this.db()
      .prepare(sql)
      .all(...params) as Record<string, unknown>[];
    return rows.map((r) => this.rowToBook(r));
  }

  /** Ported from BookRepository.SetMonitoredFlat(Book book, bool monitored): SetFields([Monitored]) + forced model event. */
  setMonitoredFlat(book: Book, monitored: boolean): void {
    const updated = { ...book, monitored };
    this.setFields(updated, ["monitored"]);
  }

  /** Ported from BookRepository.SetMonitored(IEnumerable<int> ids, bool monitored): bulk SetFields via synthetic partial models. */
  setMonitored(ids: number[], monitored: boolean): void {
    if (ids.length === 0) {
      return;
    }
    const placeholders = ids.map(() => "?").join(", ");
    this.db()
      .prepare(`UPDATE "Books" SET "Monitored" = ? WHERE "Id" IN (${placeholders})`)
      .run(toSqlValue(monitored), ...ids.map((id) => toSqlValue(id)));
  }

  /** Ported from BookRepository.GetAuthorBooksWithFiles(Author author): Books -> Editions -> BookFiles, filtered to the given author + monitored editions. */
  getAuthorBooksWithFiles(author: Author): Book[] {
    const sql = `
      SELECT DISTINCT "Books".* FROM "Books"
      JOIN "Editions" ON "Books"."Id" = "Editions"."BookId"
      JOIN "BookFiles" ON "Editions"."Id" = "BookFiles"."EditionId"
      WHERE "Books"."AuthorMetadataId" = ? AND "Editions"."Monitored" = 1
    `;
    const rows = this.db().prepare(sql).all(author.authorMetadataId) as Record<string, unknown>[];
    return rows.map((r) => this.rowToBook(r));
  }
}

const SORT_COLUMN_MAP: Record<string, string> = {
  id: "Id",
  authorMetadataId: "AuthorMetadataId",
  foreignBookId: "ForeignBookId",
  titleSlug: "TitleSlug",
  title: "Title",
  releaseDate: "ReleaseDate",
  cleanTitle: "CleanTitle",
  monitored: "Monitored",
  anyEditionOk: "AnyEditionOk",
  lastInfoSync: "LastInfoSync",
  added: "Added",
  lastSearchTime: "LastSearchTime",
};

function columnForSortKey(sortKey: string): string {
  const column = SORT_COLUMN_MAP[sortKey];
  if (!column) {
    throw new Error(`Unknown field "${sortKey}" on table "Books"`);
  }
  return column;
}

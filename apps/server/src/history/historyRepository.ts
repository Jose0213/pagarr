import type { DatabaseSync, SQLInputValue } from "node:sqlite";
import type { IDatabase } from "../db/database.js";
import { PagingSpec, SortDirection } from "../db/paging-spec.js";
import { compileFilter, type FilterExpression } from "../db/filter.js";
import { toSqlValue } from "../db/sql-value.js";
import type { QualityModel } from "../qualities/qualityModel.js";
import { qualityModelsEqual } from "../qualities/qualityModel.js";
import { Revision } from "../qualities/revision.js";
import { newEntityHistory, EntityHistoryEventType, type EntityHistory } from "./entityHistory.js";

type Row = {
  Id: number;
  SourceTitle: string;
  Date: string;
  Quality: string;
  Data: string;
  EventType: number | null;
  DownloadId: string | null;
  AuthorId: number;
  BookId: number;
};

const COLUMNS = [
  "SourceTitle",
  "Date",
  "Quality",
  "Data",
  "EventType",
  "DownloadId",
  "AuthorId",
  "BookId",
] as const;

/**
 * Ported from NzbDrone.Core/History/HistoryRepository.cs.
 *
 * DEVIATION -- not built on the shared `BasicRepository<TModel>`: the
 * `Quality`/`Data` columns are JSON-embedded documents (C#'s
 * `EmbeddedDocumentConverter<QualityModel>` /
 * `EmbeddedDocumentConverter<Dictionary<string, string>>`), same documented
 * deviation shape as `blocklisting/blocklistRepository.ts` and
 * `download-tracking/history/downloadHistoryRepository.ts`.
 *
 * `PagedBuilder()`/`PagedQuery()`/`FindByDownloadId()`/`GetByBook()`/
 * `Since()`'s Author/AuthorMetadata/Book joins (C#'s `SqlBuilder` +
 * `_database.QueryJoined`) are ported as explicit hand-written SQL LEFT
 * JOINs against the real `Authors`/`Books` tables directly (this port has
 * no generic SqlBuilder-style join layer -- see db/basic-repository.ts's
 * doc comment) rather than left unpopulated the way
 * `blocklisting/blocklistRepository.ts`'s `getPaged()` defers its own join
 * (no API layer consumes that one yet either) -- these four methods are
 * exactly the ones the real C# source always joins, so joining here keeps
 * `author`/`book` populated on the same call sites the original did,
 * matching real behavior rather than only matching call shape.
 */
export interface IHistoryRepository {
  all(): EntityHistory[];
  find(id: number): EntityHistory | undefined;
  get(id: number): EntityHistory;
  insert(model: EntityHistory): EntityHistory;
  insertMany(models: EntityHistory[]): EntityHistory[];
  updateMany(models: EntityHistory[]): void;
  getPaged(pagingSpec: PagingSpec<EntityHistory>): PagingSpec<EntityHistory>;
  mostRecentForBook(bookId: number): EntityHistory | undefined;
  mostRecentForDownloadId(downloadId: string): EntityHistory | undefined;
  findByDownloadId(downloadId: string): EntityHistory[];
  getByAuthor(authorId: number, eventType: EntityHistoryEventType | null): EntityHistory[];
  getByBook(bookId: number, eventType: EntityHistoryEventType | null): EntityHistory[];
  findDownloadHistory(authorId: number, quality: QualityModel): EntityHistory[];
  deleteForAuthor(authorId: number): void;
  since(date: string, eventType: EntityHistoryEventType | null): EntityHistory[];
}

export class HistoryRepository implements IHistoryRepository {
  constructor(private readonly database: IDatabase) {}

  private conn(): DatabaseSync {
    return this.database.openConnection();
  }

  private rowToModel(row: Row): EntityHistory {
    return newEntityHistory({
      id: row.Id,
      sourceTitle: row.SourceTitle,
      date: row.Date,
      quality: deserializeQuality(row.Quality),
      data: JSON.parse(row.Data) as Record<string, string>,
      eventType: row.EventType ?? EntityHistoryEventType.Unknown,
      downloadId: row.DownloadId,
      authorId: row.AuthorId,
      bookId: row.BookId,
    });
  }

  /** Author/Book row shape returned alongside a joined History row -- see class doc comment. */
  private rowToModelWithJoins(
    row: Row & {
      AuthorCleanName?: string | null;
      AuthorPath?: string | null;
      BookTitle?: string | null;
      BookForeignBookId?: string | null;
    }
  ): EntityHistory {
    const model = this.rowToModel(row);

    if (row.AuthorCleanName != null) {
      model.author = {
        id: row.AuthorId,
        cleanName: row.AuthorCleanName,
      } as EntityHistory["author"];
    }
    if (row.BookTitle != null) {
      model.book = {
        id: row.BookId,
        title: row.BookTitle,
        foreignBookId: row.BookForeignBookId ?? "",
      } as EntityHistory["book"];
    }

    return model;
  }

  all(): EntityHistory[] {
    const rows = this.conn().prepare('SELECT * FROM "History"').all() as unknown as Row[];
    return rows.map((r) => this.rowToModel(r));
  }

  find(id: number): EntityHistory | undefined {
    const row = this.conn().prepare('SELECT * FROM "History" WHERE "Id" = ?').get(id) as
      Row | undefined;
    return row ? this.rowToModel(row) : undefined;
  }

  get(id: number): EntityHistory {
    const model = this.find(id);
    if (!model) {
      throw new Error(`EntityHistory with ID ${id} does not exist`);
    }
    return model;
  }

  insert(model: EntityHistory): EntityHistory {
    if (model.id !== 0) {
      throw new Error(`Can't insert model with existing ID ${model.id}`);
    }

    const columnList = COLUMNS.map((c) => `"${c}"`).join(", ");
    const paramList = COLUMNS.map(() => "?").join(", ");
    const result = this.conn()
      .prepare(`INSERT INTO "History" (${columnList}) VALUES (${paramList})`)
      .run(...this.paramsFor(model));

    return { ...model, id: Number(result.lastInsertRowid) };
  }

  insertMany(models: EntityHistory[]): EntityHistory[] {
    if (models.some((m) => m.id !== 0)) {
      throw new Error("Can't insert model with existing ID != 0");
    }

    const columnList = COLUMNS.map((c) => `"${c}"`).join(", ");
    const paramList = COLUMNS.map(() => "?").join(", ");
    const conn = this.conn();
    const stmt = conn.prepare(`INSERT INTO "History" (${columnList}) VALUES (${paramList})`);
    const inserted: EntityHistory[] = [];

    conn.exec("BEGIN");
    try {
      for (const model of models) {
        const result = stmt.run(...this.paramsFor(model));
        inserted.push({ ...model, id: Number(result.lastInsertRowid) });
      }
      conn.exec("COMMIT");
    } catch (e) {
      conn.exec("ROLLBACK");
      throw e;
    }

    return inserted;
  }

  updateMany(models: EntityHistory[]): void {
    if (models.some((m) => m.id === 0)) {
      throw new Error("Can't update model with ID 0");
    }

    const assignments = COLUMNS.map((c) => `"${c}" = ?`).join(", ");
    const conn = this.conn();
    const stmt = conn.prepare(`UPDATE "History" SET ${assignments} WHERE "Id" = ?`);

    conn.exec("BEGIN");
    try {
      for (const model of models) {
        stmt.run(...this.paramsFor(model), model.id);
      }
      conn.exec("COMMIT");
    } catch (e) {
      conn.exec("ROLLBACK");
      throw e;
    }
  }

  private paramsFor(model: EntityHistory): SQLInputValue[] {
    return [
      model.sourceTitle,
      model.date,
      JSON.stringify(model.quality),
      JSON.stringify(model.data),
      model.eventType,
      model.downloadId,
      model.authorId,
      model.bookId,
    ];
  }

  /** Ported from `MostRecentForBook`: `Query(h => h.BookId == bookId).MaxBy(h => h.Date)`. */
  mostRecentForBook(bookId: number): EntityHistory | undefined {
    const row = this.conn()
      .prepare('SELECT * FROM "History" WHERE "BookId" = ? ORDER BY "Date" DESC LIMIT 1')
      .get(bookId) as Row | undefined;
    return row ? this.rowToModel(row) : undefined;
  }

  /** Ported from `MostRecentForDownloadId`: `Query(h => h.DownloadId == downloadId).MaxBy(h => h.Date)`. */
  mostRecentForDownloadId(downloadId: string): EntityHistory | undefined {
    const row = this.conn()
      .prepare('SELECT * FROM "History" WHERE "DownloadId" = ? ORDER BY "Date" DESC LIMIT 1')
      .get(downloadId) as Row | undefined;
    return row ? this.rowToModel(row) : undefined;
  }

  /** Ported from `FindByDownloadId`: joins Author + Book (see class doc comment). */
  findByDownloadId(downloadId: string): EntityHistory[] {
    const rows = this.conn()
      .prepare(
        `SELECT "History".*,
                "Authors"."CleanName" AS "AuthorCleanName", "Authors"."Path" AS "AuthorPath",
                "Books"."Title" AS "BookTitle", "Books"."ForeignBookId" AS "BookForeignBookId"
         FROM "History"
         JOIN "Authors" ON "History"."AuthorId" = "Authors"."Id"
         JOIN "Books" ON "History"."BookId" = "Books"."Id"
         WHERE "History"."DownloadId" = ?`
      )
      .all(downloadId) as unknown as (Row & {
      AuthorCleanName: string;
      AuthorPath: string;
      BookTitle: string;
      BookForeignBookId: string;
    })[];

    return rows.map((r) => this.rowToModelWithJoins(r));
  }

  /** Ported from `GetByAuthor`: unjoined, ordered by Date descending. */
  getByAuthor(authorId: number, eventType: EntityHistoryEventType | null): EntityHistory[] {
    let sql = 'SELECT * FROM "History" WHERE "AuthorId" = ?';
    const params: SQLInputValue[] = [authorId];

    if (eventType !== null) {
      sql += ' AND "EventType" = ?';
      params.push(eventType);
    }

    sql += ' ORDER BY "Date" DESC';

    const rows = this.conn()
      .prepare(sql)
      .all(...params) as unknown as Row[];
    return rows.map((r) => this.rowToModel(r));
  }

  /** Ported from `GetByBook`: joins Book, ordered by Date descending (see class doc comment). */
  getByBook(bookId: number, eventType: EntityHistoryEventType | null): EntityHistory[] {
    let sql = `SELECT "History".*, "Books"."Title" AS "BookTitle", "Books"."ForeignBookId" AS "BookForeignBookId"
               FROM "History"
               JOIN "Books" ON "History"."BookId" = "Books"."Id"
               WHERE "History"."BookId" = ?`;
    const params: SQLInputValue[] = [bookId];

    if (eventType !== null) {
      sql += ' AND "History"."EventType" = ?';
      params.push(eventType);
    }

    sql += ' ORDER BY "History"."Date" DESC';

    const rows = this.conn()
      .prepare(sql)
      .all(...params) as unknown as (Row & {
      BookTitle: string;
      BookForeignBookId: string;
    })[];

    return rows.map((r) => this.rowToModelWithJoins(r));
  }

  /**
   * Ported from `FindDownloadHistory`: `Query(h => h.AuthorId == idAuthorId
   * && h.Quality == quality && allowed.Contains((int)h.EventType))` where
   * `allowed` is {Grabbed, DownloadFailed, BookFileImported}. `Quality`
   * equality is a JSON-embedded-document compare in C# (Dapper's
   * `EmbeddedDocumentConverter` round-trips it, and `QualityModel`
   * implements `IEquatable`) -- fetched by AuthorId+EventType via SQL, then
   * filtered by `qualityModelsEqual` in-memory rather than a SQL JSON
   * comparison, matching this repo's own precedent
   * (`download-tracking/history/downloadHistoryService.ts` compares
   * embedded-document fields in application code, not SQL).
   */
  findDownloadHistory(authorId: number, quality: QualityModel): EntityHistory[] {
    const allowed = [
      EntityHistoryEventType.Grabbed,
      EntityHistoryEventType.DownloadFailed,
      EntityHistoryEventType.BookFileImported,
    ];
    const placeholders = allowed.map(() => "?").join(", ");

    const rows = this.conn()
      .prepare(`SELECT * FROM "History" WHERE "AuthorId" = ? AND "EventType" IN (${placeholders})`)
      .all(authorId, ...allowed) as unknown as Row[];

    return rows
      .map((r) => this.rowToModel(r))
      .filter((h) => qualityModelsEqual(h.quality, quality));
  }

  /** Ported from `DeleteForAuthor`: `Delete(c => c.AuthorId == authorId)`. */
  deleteForAuthor(authorId: number): void {
    this.conn().prepare('DELETE FROM "History" WHERE "AuthorId" = ?').run(authorId);
  }

  /** Ported from `Since`: joins Author (inner) + Book (left), ordered by Date ascending (see class doc comment). */
  since(date: string, eventType: EntityHistoryEventType | null): EntityHistory[] {
    let sql = `SELECT "History".*,
                      "Authors"."CleanName" AS "AuthorCleanName", "Authors"."Path" AS "AuthorPath",
                      "Books"."Title" AS "BookTitle", "Books"."ForeignBookId" AS "BookForeignBookId"
               FROM "History"
               JOIN "Authors" ON "History"."AuthorId" = "Authors"."Id"
               LEFT JOIN "Books" ON "History"."BookId" = "Books"."Id"
               WHERE "History"."Date" >= ?`;
    const params: SQLInputValue[] = [date];

    if (eventType !== null) {
      sql += ' AND "History"."EventType" = ?';
      params.push(eventType);
    }

    sql += ' ORDER BY "History"."Date" ASC';

    const rows = this.conn()
      .prepare(sql)
      .all(...params) as unknown as (Row & {
      AuthorCleanName: string;
      AuthorPath: string;
      BookTitle: string | null;
      BookForeignBookId: string | null;
    })[];

    return rows.map((r) => this.rowToModelWithJoins(r));
  }

  /**
   * Ported from the inherited `BasicRepository<EntityHistory>.GetPaged()`,
   * with `PagedBuilder()`'s Author+AuthorMetadata+Book join (see class doc
   * comment) applied the same way `findByDownloadId`'s join is.
   */
  getPaged(pagingSpec: PagingSpec<EntityHistory>): PagingSpec<EntityHistory> {
    const columnFor = (field: string): string => {
      if (field === "id") {
        return '"History"."Id"';
      }
      const column = COLUMNS.find((c) => c.toLowerCase() === field.toLowerCase());
      if (!column) {
        throw new Error(`Unknown field "${field}" on table "History"`);
      }
      return `"History"."${column}"`;
    };

    const whereClause = this.buildWhereClause(pagingSpec.filterExpressions, columnFor);
    const sortKey = pagingSpec.sortKey ?? "id";
    const sortColumn = columnFor(sortKey === "History.id" ? "id" : sortKey);
    const direction = pagingSpec.sortDirection === SortDirection.Descending ? "DESC" : "ASC";
    const pageOffset = Math.max(pagingSpec.page - 1, 0) * pagingSpec.pageSize;

    const recordsSql = `SELECT "History".*,
                                "Authors"."CleanName" AS "AuthorCleanName", "Authors"."Path" AS "AuthorPath",
                                "Books"."Title" AS "BookTitle", "Books"."ForeignBookId" AS "BookForeignBookId"
                         FROM "History"
                         JOIN "Authors" ON "History"."AuthorId" = "Authors"."Id"
                         JOIN "Books" ON "History"."BookId" = "Books"."Id"
                         ${whereClause.sql}
                         ORDER BY ${sortColumn} ${direction} LIMIT ? OFFSET ?`;
    const rows = this.conn()
      .prepare(recordsSql)
      .all(...whereClause.params, pagingSpec.pageSize, pageOffset) as unknown as (Row & {
      AuthorCleanName: string;
      AuthorPath: string;
      BookTitle: string;
      BookForeignBookId: string;
    })[];

    const countSql = `SELECT COUNT(*) as count FROM "History"
                       JOIN "Authors" ON "History"."AuthorId" = "Authors"."Id"
                       JOIN "Books" ON "History"."BookId" = "Books"."Id"
                       ${whereClause.sql}`;
    const countRow = this.conn()
      .prepare(countSql)
      .get(...whereClause.params) as { count: number };

    pagingSpec.records = rows.map((r) => this.rowToModelWithJoins(r));
    pagingSpec.totalRecords = countRow.count;

    return pagingSpec;
  }

  private buildWhereClause(
    filters: FilterExpression<EntityHistory>[],
    columnFor: (field: string) => string
  ): { sql: string; params: SQLInputValue[] } {
    if (filters.length === 0) {
      return { sql: "", params: [] };
    }
    const compiled = filters.map((f) => compileFilter(f, columnFor));
    return {
      sql: "WHERE " + compiled.map((c) => c.sql).join(" AND "),
      params: compiled.flatMap((c) => c.params.map(toSqlValue)),
    };
  }
}

/**
 * Deserializes a JSON-embedded `Quality` column back into a real
 * `QualityModel`, reconstructing `revision` as a real `Revision` class
 * instance rather than the plain object `JSON.parse` alone produces.
 *
 * C#'s Dapper `EmbeddedDocumentConverter<QualityModel>` deserializes
 * straight into the real typed `QualityModel`/`Revision` classes, so
 * downstream code (`QualityModel.Equals`, called by
 * `findDownloadHistory`'s `h.Quality == quality` filter) always has real
 * method-bearing instances to call. `JSON.parse` alone has no such type
 * information -- it would leave `revision` as a bare `{version, real,
 * isRepack}` object with no `.equals()` method, which throws the moment
 * `qualityModelsEqual` (this repository's `findDownloadHistory` filter)
 * calls `right.revision.equals(...)` on it. This reconstructs the real
 * `Revision` instance so every method on the deserialized `QualityModel`
 * behaves identically to a freshly-constructed one, matching Dapper's
 * behavior.
 */
function deserializeQuality(json: string): QualityModel {
  const parsed = JSON.parse(json) as QualityModel;
  return {
    ...parsed,
    revision: new Revision(parsed.revision),
  };
}

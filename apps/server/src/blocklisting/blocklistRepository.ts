import type { DatabaseSync, SQLInputValue } from "node:sqlite";
import type { IDatabase } from "../db/database.js";
import { PagingSpec, SortDirection } from "../db/paging-spec.js";
import { compileFilter, type FilterExpression } from "../db/filter.js";
import { toSqlValue } from "../db/sql-value.js";
import type { QualityModel } from "../qualities/qualityModel.js";
import { Revision } from "../qualities/revision.js";
import { newBlocklist, type Blocklist } from "./blocklist.js";

type Row = {
  Id: number;
  AuthorId: number;
  BookIds: string;
  SourceTitle: string;
  Quality: string;
  Date: string;
  PublishedDate: string | null;
  Size: number | null;
  Protocol: number | null;
  Indexer: string | null;
  IndexerFlags: number;
  Message: string | null;
  TorrentInfoHash: string | null;
};

const COLUMNS = [
  "AuthorId",
  "BookIds",
  "SourceTitle",
  "Quality",
  "Date",
  "PublishedDate",
  "Size",
  "Protocol",
  "Indexer",
  "IndexerFlags",
  "Message",
  "TorrentInfoHash",
] as const;

/**
 * Ported from NzbDrone.Core/Blocklisting/BlocklistRepository.cs.
 *
 * DEVIATION -- not built on the shared `BasicRepository<TModel>`: the
 * `Quality`/`BookIds` columns are JSON-embedded documents (C#'s
 * `EmbeddedDocumentConverter<QualityModel>` /
 * `EmbeddedDocumentConverter<List<int>>`), same documented deviation shape
 * as `download-tracking/history/downloadHistoryRepository.ts`,
 * `indexers/IndexerStatusRepository.ts`, and
 * `download-tracking/pending/pendingReleaseRepository.ts`.
 *
 * `PagedBuilder()`/`PagedQuery()` (C#'s join to Authors/AuthorMetadata so a
 * paged listing comes back with `.Author`/`.Author.Metadata` populated) has
 * no port here: this port has no generic SqlBuilder-style join layer (see
 * db/basic-repository.ts's doc comment) and no API layer consumes paged
 * Blocklist listings yet. `getPaged()` below returns rows with `author`
 * left unpopulated -- a future API-layer port can add the join the same way
 * `books/authorRepository.ts` hand-wrote its own metadata join, without
 * changing this class's other methods.
 */
export interface IBlocklistRepository {
  all(): Blocklist[];
  find(id: number): Blocklist | undefined;
  get(id: number): Blocklist;
  insert(model: Blocklist): Blocklist;
  delete(id: number): void;
  deleteMany(idsOrModels: number[] | Blocklist[]): void;
  purge(): void;
  getPaged(pagingSpec: PagingSpec<Blocklist>): PagingSpec<Blocklist>;
  blocklistedByTitle(authorId: number, sourceTitle: string): Blocklist[];
  blocklistedByTorrentInfoHash(authorId: number, torrentInfoHash: string): Blocklist[];
  blocklistedByAuthor(authorId: number): Blocklist[];
}

export class BlocklistRepository implements IBlocklistRepository {
  constructor(private readonly database: IDatabase) {}

  private conn(): DatabaseSync {
    return this.database.openConnection();
  }

  private rowToModel(row: Row): Blocklist {
    return newBlocklist({
      id: row.Id,
      authorId: row.AuthorId,
      bookIds: JSON.parse(row.BookIds) as number[],
      sourceTitle: row.SourceTitle,
      quality: deserializeQuality(row.Quality),
      date: row.Date,
      publishedDate: row.PublishedDate,
      size: row.Size,
      protocol: (row.Protocol ?? 0) as Blocklist["protocol"],
      indexer: row.Indexer,
      indexerFlags: row.IndexerFlags,
      message: row.Message,
      torrentInfoHash: row.TorrentInfoHash,
    });
  }

  all(): Blocklist[] {
    const rows = this.conn().prepare('SELECT * FROM "Blocklist"').all() as unknown as Row[];
    return rows.map((r) => this.rowToModel(r));
  }

  find(id: number): Blocklist | undefined {
    const row = this.conn().prepare('SELECT * FROM "Blocklist" WHERE "Id" = ?').get(id) as
      Row | undefined;
    return row ? this.rowToModel(row) : undefined;
  }

  get(id: number): Blocklist {
    const model = this.find(id);
    if (!model) {
      throw new Error(`Blocklist with ID ${id} does not exist`);
    }
    return model;
  }

  insert(model: Blocklist): Blocklist {
    if (model.id !== 0) {
      throw new Error(`Can't insert model with existing ID ${model.id}`);
    }

    const columnList = COLUMNS.map((c) => `"${c}"`).join(", ");
    const paramList = COLUMNS.map(() => "?").join(", ");
    const result = this.conn()
      .prepare(`INSERT INTO "Blocklist" (${columnList}) VALUES (${paramList})`)
      .run(
        model.authorId,
        JSON.stringify(model.bookIds),
        model.sourceTitle,
        JSON.stringify(model.quality),
        model.date,
        model.publishedDate,
        toSqlValue(model.size),
        model.protocol,
        model.indexer,
        model.indexerFlags,
        model.message,
        model.torrentInfoHash
      );

    return { ...model, id: Number(result.lastInsertRowid) };
  }

  delete(id: number): void {
    this.conn().prepare('DELETE FROM "Blocklist" WHERE "Id" = ?').run(id);
  }

  deleteMany(idsOrModels: number[] | Blocklist[]): void {
    if (idsOrModels.length === 0) {
      return;
    }
    const ids = idsOrModels.map((m) => (typeof m === "number" ? m : m.id));
    const placeholders = ids.map(() => "?").join(", ");
    this.conn()
      .prepare(`DELETE FROM "Blocklist" WHERE "Id" IN (${placeholders})`)
      .run(...ids);
  }

  /** Ported from `BasicRepository.Purge(bool vacuum = false)` (no callers pass `vacuum: true` for Blocklist -- see ClearBlocklistCommand). */
  purge(): void {
    this.conn().exec('DELETE FROM "Blocklist"');
  }

  /**
   * Ported from the inherited `BasicRepository<Blocklist>.GetPaged()` --
   * see class doc comment on why the Author/AuthorMetadata join isn't
   * carried over.
   */
  getPaged(pagingSpec: PagingSpec<Blocklist>): PagingSpec<Blocklist> {
    const columnFor = (field: string): string => {
      if (field === "id") {
        return '"Blocklist"."Id"';
      }
      const column = COLUMNS.find((c) => c.toLowerCase() === field.toLowerCase());
      if (!column) {
        throw new Error(`Unknown field "${field}" on table "Blocklist"`);
      }
      return `"Blocklist"."${column}"`;
    };

    const whereClause = this.buildWhereClause(pagingSpec.filterExpressions, columnFor);
    const sortKey = pagingSpec.sortKey ?? "id";
    const sortColumn = columnFor(sortKey === "Blocklist.id" ? "id" : sortKey);
    const direction = pagingSpec.sortDirection === SortDirection.Descending ? "DESC" : "ASC";
    const pageOffset = Math.max(pagingSpec.page - 1, 0) * pagingSpec.pageSize;

    const recordsSql = `SELECT * FROM "Blocklist" ${whereClause.sql} ORDER BY ${sortColumn} ${direction} LIMIT ? OFFSET ?`;
    const rows = this.conn()
      .prepare(recordsSql)
      .all(...whereClause.params, pagingSpec.pageSize, pageOffset) as unknown as Row[];

    const countSql = `SELECT COUNT(*) as count FROM "Blocklist" ${whereClause.sql}`;
    const countRow = this.conn()
      .prepare(countSql)
      .get(...whereClause.params) as { count: number };

    pagingSpec.records = rows.map((r) => this.rowToModel(r));
    pagingSpec.totalRecords = countRow.count;

    return pagingSpec;
  }

  private buildWhereClause(
    filters: FilterExpression<Blocklist>[],
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

  /** Ported from `BlocklistedByTitle`: `Query(e => e.AuthorId == authorId && e.SourceTitle.Contains(sourceTitle))`. */
  blocklistedByTitle(authorId: number, sourceTitle: string): Blocklist[] {
    const rows = this.conn()
      .prepare(
        'SELECT * FROM "Blocklist" WHERE "AuthorId" = ? AND "SourceTitle" LIKE \'%\' || ? || \'%\''
      )
      .all(authorId, sourceTitle) as unknown as Row[];
    return rows.map((r) => this.rowToModel(r));
  }

  /** Ported from `BlocklistedByTorrentInfoHash`: `Query(e => e.AuthorId == authorId && e.TorrentInfoHash.Contains(torrentInfoHash))`. */
  blocklistedByTorrentInfoHash(authorId: number, torrentInfoHash: string): Blocklist[] {
    const rows = this.conn()
      .prepare(
        'SELECT * FROM "Blocklist" WHERE "AuthorId" = ? AND "TorrentInfoHash" LIKE \'%\' || ? || \'%\''
      )
      .all(authorId, torrentInfoHash) as unknown as Row[];
    return rows.map((r) => this.rowToModel(r));
  }

  /** Ported from `BlocklistedByAuthor`: `Query(b => b.AuthorId == authorId)`. */
  blocklistedByAuthor(authorId: number): Blocklist[] {
    const rows = this.conn()
      .prepare('SELECT * FROM "Blocklist" WHERE "AuthorId" = ?')
      .all(authorId) as unknown as Row[];
    return rows.map((r) => this.rowToModel(r));
  }
}

/**
 * Deserializes a JSON-embedded `Quality` column back into a real
 * `QualityModel`, reconstructing `revision` as a real `Revision` class
 * instance -- see `history/historyRepository.ts`'s identical helper (same
 * doc comment applies: `JSON.parse` alone leaves `revision` as a bare
 * object with no `.equals()`/`.compareTo()` methods, unlike C#'s Dapper
 * `EmbeddedDocumentConverter<QualityModel>`, which deserializes straight
 * into the real typed classes).
 */
function deserializeQuality(json: string): QualityModel {
  const parsed = JSON.parse(json) as QualityModel;
  return {
    ...parsed,
    revision: new Revision(parsed.revision),
  };
}

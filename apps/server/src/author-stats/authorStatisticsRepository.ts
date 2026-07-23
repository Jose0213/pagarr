import type { DatabaseSync } from "node:sqlite";
import type { IDatabase } from "../db/database.js";
import type { BookStatistics } from "./bookStatistics.js";

type Row = {
  AuthorId: number;
  BookId: number;
  SizeOnDisk: number;
  TotalBookCount: number;
  AvailableBookCount: number;
  BookCount: number;
  BookFileCount: number;
};

/**
 * Ported from NzbDrone.Core/AuthorStats/AuthorStatisticsRepository.cs.
 *
 * DEVIATION -- not built on `BasicRepository<TModel>`: this repository never
 * had a real backing table (`BookStatistics`/`AuthorStatistics` are
 * `ResultSet`s, not `ModelBase` entities) -- the C# original is a single
 * hand-built `SqlBuilder` aggregation query joining Editions/Books/Authors/
 * BookFiles, executed directly via Dapper. Ported here as one parameterized
 * SQL string built the same way `SqlBuilder`'s template
 * (`SELECT /**select**\/ FROM "Editions" /**join**\//**innerjoin**\//**leftjoin**\//**where**\//**groupby**\//**having**\//**orderby**\*\/`)
 * would render it for this specific query (no generic join-builder exists
 * in this port -- see db/basic-repository.ts's doc comment on why
 * SqlBuilder itself isn't ported), with `authorId` filtering as an optional
 * bound parameter standing in for the C# overload's extra `.Where<Author>`
 * clause.
 *
 * The GROUP BY / CASE-WHEN aggregation logic (bookCount counts a book as
 * "counted" if [monitored AND released] OR has a file; availableBookCount
 * is 1 iff a BookFile exists; bookFileCount is the joined BookFile row
 * count) is copied verbatim from the C# `Select(...)` template, including
 * `@currentDate` bound once per query (not per row) exactly as the C#
 * `AddParameters` call does.
 */
export interface IAuthorStatisticsRepository {
  authorStatistics(): BookStatistics[];
  authorStatisticsByAuthor(authorId: number): BookStatistics[];
}

const BASE_QUERY = `
  SELECT "Authors"."Id" AS "AuthorId",
         "Books"."Id" AS "BookId",
         SUM(COALESCE("BookFiles"."Size", 0)) AS "SizeOnDisk",
         1 AS "TotalBookCount",
         CASE WHEN MIN("BookFiles"."Id") IS NULL THEN 0 ELSE 1 END AS "AvailableBookCount",
         CASE WHEN ("Books"."Monitored" = 1 AND ("Books"."ReleaseDate" < ?) OR "Books"."ReleaseDate" IS NULL) OR MIN("BookFiles"."Id") IS NOT NULL THEN 1 ELSE 0 END AS "BookCount",
         CASE WHEN MIN("BookFiles"."Id") IS NULL THEN 0 ELSE COUNT("BookFiles"."Id") END AS "BookFileCount"
  FROM "Editions"
  JOIN "Books" ON "Editions"."BookId" = "Books"."Id"
  JOIN "Authors" ON "Books"."AuthorMetadataId" = "Authors"."AuthorMetadataId"
  LEFT JOIN "BookFiles" ON "Editions"."Id" = "BookFiles"."EditionId"
  WHERE "Editions"."Monitored" = 1
`;

export class AuthorStatisticsRepository implements IAuthorStatisticsRepository {
  constructor(private readonly database: IDatabase) {}

  private conn(): DatabaseSync {
    return this.database.openConnection();
  }

  private rowToModel(row: Row): BookStatistics {
    return {
      authorId: row.AuthorId,
      bookId: row.BookId,
      sizeOnDisk: row.SizeOnDisk,
      totalBookCount: row.TotalBookCount,
      availableBookCount: row.AvailableBookCount,
      bookCount: row.BookCount,
      bookFileCount: row.BookFileCount,
    };
  }

  authorStatistics(): BookStatistics[] {
    const currentDate = new Date().toISOString();
    const sql = `${BASE_QUERY} GROUP BY "Authors"."Id", "Books"."Id"`;
    const rows = this.conn().prepare(sql).all(currentDate) as unknown as Row[];
    return rows.map((r) => this.rowToModel(r));
  }

  authorStatisticsByAuthor(authorId: number): BookStatistics[] {
    const currentDate = new Date().toISOString();
    const sql = `${BASE_QUERY} AND "Authors"."Id" = ? GROUP BY "Authors"."Id", "Books"."Id"`;
    const rows = this.conn().prepare(sql).all(currentDate, authorId) as unknown as Row[];
    return rows.map((r) => this.rowToModel(r));
  }
}

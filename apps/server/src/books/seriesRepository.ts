/**
 * Ported from NzbDrone.Core/Books/Repositories/SeriesRepository.cs.
 *
 * Backing table: Series (migration 0001). See authorRepository.ts's module
 * doc comment for the general "no SqlBuilder join layer" deviation this
 * repository also follows.
 */

import type { DatabaseSync } from "node:sqlite";
import type { IDatabase } from "../db/database.js";
import { BasicRepository, type ColumnMapping } from "../db/basic-repository.js";
import type { IEventAggregator } from "../db/events.js";
import type { Series } from "./models.js";

const SERIES_COLUMNS: ColumnMapping<Series>[] = [
  { prop: "foreignSeriesId", column: "ForeignSeriesId" },
  { prop: "title", column: "Title" },
  { prop: "description", column: "Description" },
  { prop: "numbered", column: "Numbered", type: "boolean" },
  { prop: "workCount", column: "WorkCount" },
  { prop: "primaryWorkCount", column: "PrimaryWorkCount" },
];

export class SeriesRepository extends BasicRepository<Series> {
  constructor(database: IDatabase, eventAggregator?: IEventAggregator) {
    super(database, { tableName: "Series", columns: SERIES_COLUMNS, eventAggregator });
  }

  private db(): DatabaseSync {
    return this.database.openConnection();
  }

  /** Ported from SeriesRepository.FindById(string foreignSeriesId): `Query(x => x.ForeignSeriesId == foreignSeriesId).SingleOrDefault()`. */
  findById(foreignSeriesId: string): Series | undefined {
    return this.all().find((s) => s.foreignSeriesId === foreignSeriesId);
  }

  /** Ported from SeriesRepository.FindById(List<string> foreignSeriesId): `Query(x => foreignSeriesId.Contains(x.ForeignSeriesId))`. */
  findByIds(foreignSeriesIds: string[]): Series[] {
    const set = new Set(foreignSeriesIds);
    return this.all().filter((s) => set.has(s.foreignSeriesId));
  }

  /** Ported from SeriesRepository.GetByAuthorMetadataId(int authorMetadataId): Series -> SeriesBookLink -> Books, distinct. */
  getByAuthorMetadataId(authorMetadataId: number): Series[] {
    const sql = `
      SELECT DISTINCT "Series".* FROM "Series"
      JOIN "SeriesBookLink" ON "Series"."Id" = "SeriesBookLink"."SeriesId"
      JOIN "Books" ON "SeriesBookLink"."BookId" = "Books"."Id"
      WHERE "Books"."AuthorMetadataId" = ?
    `;
    const rows = this.db().prepare(sql).all(authorMetadataId) as Record<string, unknown>[];
    return rows.map((r) => this.rowToSeries(r));
  }

  /** Ported from SeriesRepository.GetByAuthorId(int authorId): Series -> SeriesBookLink -> Books -> Authors, distinct. */
  getByAuthorId(authorId: number): Series[] {
    const sql = `
      SELECT DISTINCT "Series".* FROM "Series"
      JOIN "SeriesBookLink" ON "Series"."Id" = "SeriesBookLink"."SeriesId"
      JOIN "Books" ON "SeriesBookLink"."BookId" = "Books"."Id"
      JOIN "Authors" ON "Books"."AuthorMetadataId" = "Authors"."AuthorMetadataId"
      WHERE "Authors"."Id" = ?
    `;
    const rows = this.db().prepare(sql).all(authorId) as Record<string, unknown>[];
    return rows.map((r) => this.rowToSeries(r));
  }

  private rowToSeries(row: Record<string, unknown>): Series {
    return {
      id: row["Id"] as number,
      foreignSeriesId: row["ForeignSeriesId"] as string,
      title: row["Title"] as string,
      description: row["Description"] as string | null,
      numbered: Boolean(row["Numbered"]),
      workCount: row["WorkCount"] as number,
      primaryWorkCount: row["PrimaryWorkCount"] as number,
    };
  }
}

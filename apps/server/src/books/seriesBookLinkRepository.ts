/**
 * Ported from NzbDrone.Core/Books/Repositories/SeriesBookLinkRepository.cs.
 *
 * Backing table: SeriesBookLink (migration 0001 + 0018's SeriesPosition
 * column). See authorRepository.ts's module doc comment for the general
 * "no SqlBuilder join layer" deviation this repository also follows.
 */

import type { DatabaseSync } from "node:sqlite";
import type { IDatabase } from "../db/database.js";
import { BasicRepository, type ColumnMapping } from "../db/basic-repository.js";
import type { IEventAggregator } from "../db/events.js";
import { toSqlValue } from "../db/sql-value.js";
import type { SeriesBookLink } from "./models.js";

const SERIES_BOOK_LINK_COLUMNS: ColumnMapping<SeriesBookLink>[] = [
  { prop: "seriesId", column: "SeriesId" },
  { prop: "bookId", column: "BookId" },
  { prop: "position", column: "Position" },
  { prop: "isPrimary", column: "IsPrimary", type: "boolean" },
  { prop: "seriesPosition", column: "SeriesPosition" },
];

export class SeriesBookLinkRepository extends BasicRepository<SeriesBookLink> {
  constructor(database: IDatabase, eventAggregator?: IEventAggregator) {
    super(database, {
      tableName: "SeriesBookLink",
      columns: SERIES_BOOK_LINK_COLUMNS,
      eventAggregator,
    });
  }

  private db(): DatabaseSync {
    return this.database.openConnection();
  }

  private rowToLink(row: Record<string, unknown>): SeriesBookLink {
    return {
      id: row["Id"] as number,
      seriesId: row["SeriesId"] as number,
      bookId: row["BookId"] as number,
      position: row["Position"] as string | null,
      isPrimary: Boolean(row["IsPrimary"]),
      seriesPosition: row["SeriesPosition"] as number,
    };
  }

  /** Ported from SeriesBookLinkRepository.GetLinksBySeries(int seriesId): `Query(x => x.SeriesId == seriesId)`. */
  getLinksBySeries(seriesId: number): SeriesBookLink[] {
    const rows = this.db()
      .prepare('SELECT * FROM "SeriesBookLink" WHERE "SeriesId" = ?')
      .all(seriesId) as Record<string, unknown>[];
    return rows.map((r) => this.rowToLink(r));
  }

  /** Ported from SeriesBookLinkRepository.GetLinksBySeriesAndAuthor(int seriesId, string foreignAuthorId): joins Books -> AuthorMetadata. */
  getLinksBySeriesAndAuthor(seriesId: number, foreignAuthorId: string): SeriesBookLink[] {
    const sql = `
      SELECT "SeriesBookLink".* FROM "SeriesBookLink"
      JOIN "Books" ON "SeriesBookLink"."BookId" = "Books"."Id"
      JOIN "AuthorMetadata" ON "Books"."AuthorMetadataId" = "AuthorMetadata"."Id"
      WHERE "SeriesBookLink"."SeriesId" = ? AND "AuthorMetadata"."ForeignAuthorId" = ?
    `;
    const rows = this.db().prepare(sql).all(seriesId, foreignAuthorId) as Record<string, unknown>[];
    return rows.map((r) => this.rowToLink(r));
  }

  /** Ported from SeriesBookLinkRepository.GetLinksByBook(List<int> bookIds): joins Series (populates .series on each link). */
  getLinksByBook(bookIds: number[]): SeriesBookLink[] {
    if (bookIds.length === 0) {
      return [];
    }
    const placeholders = bookIds.map(() => "?").join(", ");
    const sql = `
      SELECT "SeriesBookLink".*, "Series"."Id" as "Series_Id", "Series"."ForeignSeriesId" as "Series_ForeignSeriesId",
        "Series"."Title" as "Series_Title", "Series"."Description" as "Series_Description",
        "Series"."Numbered" as "Series_Numbered", "Series"."WorkCount" as "Series_WorkCount",
        "Series"."PrimaryWorkCount" as "Series_PrimaryWorkCount"
      FROM "SeriesBookLink"
      JOIN "Series" ON "SeriesBookLink"."SeriesId" = "Series"."Id"
      WHERE "SeriesBookLink"."BookId" IN (${placeholders})
    `;
    const rows = this.db()
      .prepare(sql)
      .all(...bookIds.map((id) => toSqlValue(id))) as Record<string, unknown>[];

    return rows.map((row) => {
      const link = this.rowToLink(row);
      link.series = {
        id: row["Series_Id"] as number,
        foreignSeriesId: row["Series_ForeignSeriesId"] as string,
        title: row["Series_Title"] as string,
        description: row["Series_Description"] as string | null,
        numbered: Boolean(row["Series_Numbered"]),
        workCount: row["Series_WorkCount"] as number,
        primaryWorkCount: row["Series_PrimaryWorkCount"] as number,
      };
      return link;
    });
  }
}

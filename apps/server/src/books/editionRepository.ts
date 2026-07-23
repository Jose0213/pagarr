/**
 * Ported from NzbDrone.Core/Books/Repositories/EditionRepository.cs.
 *
 * Backing table: Editions (migration 0001 + 0022's monitored index).
 *
 * See authorRepository.ts's module doc comment for the general "no
 * SqlBuilder join layer" deviation this repository also follows, and
 * authorMetadataRepository.ts's module doc comment for the "JSON-embedded
 * columns" deviation (here: Images, Links, Ratings) this repository also
 * follows for its inherited generic CRUD methods.
 */

import type { DatabaseSync } from "node:sqlite";
import type { IDatabase } from "../db/database.js";
import { BasicRepository, type ColumnMapping } from "../db/basic-repository.js";
import type { IEventAggregator } from "../db/events.js";
import { toSqlValue } from "../db/sql-value.js";
import type { Edition } from "./models.js";

const EDITION_COLUMNS: ColumnMapping<Edition>[] = [
  { prop: "bookId", column: "BookId" },
  { prop: "foreignEditionId", column: "ForeignEditionId" },
  { prop: "isbn13", column: "Isbn13" },
  { prop: "asin", column: "Asin" },
  { prop: "title", column: "Title" },
  { prop: "titleSlug", column: "TitleSlug" },
  { prop: "language", column: "Language" },
  { prop: "overview", column: "Overview" },
  { prop: "format", column: "Format" },
  { prop: "isEbook", column: "IsEbook", type: "boolean" },
  { prop: "disambiguation", column: "Disambiguation" },
  { prop: "publisher", column: "Publisher" },
  { prop: "pageCount", column: "PageCount" },
  { prop: "releaseDate", column: "ReleaseDate" },
  { prop: "images", column: "Images" },
  { prop: "links", column: "Links" },
  { prop: "ratings", column: "Ratings" },
  { prop: "monitored", column: "Monitored", type: "boolean" },
  { prop: "manualAdd", column: "ManualAdd", type: "boolean" },
];

/** Serializes the JSON-embedded fields to strings, ready for BasicRepository's toSqlValue-based binding. */
function serialize(model: Edition): Edition {
  return {
    ...model,
    images: JSON.stringify(model.images) as unknown as Edition["images"],
    links: JSON.stringify(model.links) as unknown as Edition["links"],
    ratings: JSON.stringify(model.ratings) as unknown as Edition["ratings"],
  };
}

/** Deserializes the JSON-embedded fields back from the strings BasicRepository read off the row. */
function deserializeEdition(model: Edition): Edition {
  return {
    ...model,
    images: parseOr(model.images as unknown as string, []),
    links: parseOr(model.links as unknown as string, []),
    ratings: parseOr(model.ratings as unknown as string, { votes: 0, value: 0 }),
  };
}

function parseOr<T>(value: string | null | undefined, fallback: T): T {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }
  if (typeof value !== "string") {
    return value;
  }
  return JSON.parse(value) as T;
}

export class EditionRepository extends BasicRepository<Edition> {
  constructor(database: IDatabase, eventAggregator?: IEventAggregator) {
    super(database, { tableName: "Editions", columns: EDITION_COLUMNS, eventAggregator });
  }

  private db(): DatabaseSync {
    return this.database.openConnection();
  }

  override all(): Edition[] {
    return super.all().map(deserializeEdition);
  }

  override find(id: number): Edition | undefined {
    const model = super.find(id);
    return model ? deserializeEdition(model) : undefined;
  }

  override get(id: number): Edition {
    return deserializeEdition(super.get(id));
  }

  override getMany(ids: number[]): Edition[] {
    return super.getMany(ids).map(deserializeEdition);
  }

  override single(): Edition {
    return deserializeEdition(super.single());
  }

  override singleOrDefault(): Edition | undefined {
    const model = super.singleOrDefault();
    return model ? deserializeEdition(model) : undefined;
  }

  override insert(model: Edition): Edition {
    return deserializeEdition(super.insert(serialize(model)));
  }

  override insertMany(models: Edition[]): Edition[] {
    return super.insertMany(models.map(serialize)).map(deserializeEdition);
  }

  override update(model: Edition): Edition {
    return deserializeEdition(super.update(serialize(model)));
  }

  override updateMany(models: Edition[]): void {
    super.updateMany(models.map(serialize));
  }

  override upsert(model: Edition): Edition {
    return deserializeEdition(super.upsert(serialize(model)));
  }

  override setFields(model: Edition, properties: Exclude<keyof Edition, "id">[]): void {
    super.setFields(serialize(model), properties);
  }

  private rowToEdition(row: Record<string, unknown>): Edition {
    return {
      id: row["Id"] as number,
      bookId: row["BookId"] as number,
      foreignEditionId: row["ForeignEditionId"] as string,
      titleSlug: row["TitleSlug"] as string,
      isbn13: row["Isbn13"] as string | null,
      asin: row["Asin"] as string | null,
      title: row["Title"] as string,
      language: row["Language"] as string | null,
      overview: (row["Overview"] as string | null) ?? "",
      format: row["Format"] as string | null,
      isEbook: Boolean(row["IsEbook"]),
      disambiguation: row["Disambiguation"] as string | null,
      publisher: row["Publisher"] as string | null,
      pageCount: (row["PageCount"] as number | null) ?? 0,
      releaseDate: row["ReleaseDate"] as string | null,
      images: parseOr(row["Images"] as string | null, []),
      links: parseOr(row["Links"] as string | null, []),
      ratings: parseOr(row["Ratings"] as string | null, { votes: 0, value: 0 }),
      monitored: Boolean(row["Monitored"]),
      manualAdd: Boolean(row["ManualAdd"]),
    };
  }

  /** Ported from EditionRepository.GetAllMonitoredEditions(): `Query(x => x.Monitored == true)`. */
  getAllMonitoredEditions(): Edition[] {
    const rows = this.db()
      .prepare('SELECT * FROM "Editions" WHERE "Monitored" = 1')
      .all() as Record<string, unknown>[];
    return rows.map((r) => this.rowToEdition(r));
  }

  /** Ported from EditionRepository.FindByForeignEditionId(string foreignEditionId): `Query(x => x.ForeignEditionId == foreignEditionId).SingleOrDefault()`. */
  findByForeignEditionId(foreignEditionId: string): Edition | undefined {
    const row = this.db()
      .prepare('SELECT * FROM "Editions" WHERE "ForeignEditionId" = ?')
      .get(foreignEditionId) as Record<string, unknown> | undefined;
    return row ? this.rowToEdition(row) : undefined;
  }

  /** Ported from EditionRepository.GetEditionsForRefresh(int bookId, List<string> foreignEditionIds). */
  getEditionsForRefresh(bookId: number, foreignEditionIds: string[]): Edition[] {
    if (foreignEditionIds.length === 0) {
      const rows = this.db()
        .prepare('SELECT * FROM "Editions" WHERE "BookId" = ?')
        .all(bookId) as Record<string, unknown>[];
      return rows.map((r) => this.rowToEdition(r));
    }
    const placeholders = foreignEditionIds.map(() => "?").join(", ");
    const sql = `SELECT * FROM "Editions" WHERE "BookId" = ? OR "ForeignEditionId" IN (${placeholders})`;
    const rows = this.db()
      .prepare(sql)
      .all(bookId, ...foreignEditionIds) as Record<string, unknown>[];
    return rows.map((r) => this.rowToEdition(r));
  }

  /**
   * Ported from EditionRepository.FindByBook(IEnumerable<int> ids): left
   * joins Book + AuthorMetadata onto each Edition, matching the C#
   * comment ("populate the books and author metadata also... hopefully
   * speeds up track matching a lot"). Deviation: since Book/AuthorMetadata
   * are TS interfaces without lazy-load wrappers (see models.ts's module
   * doc comment), this only populates edition.bookId's basic Book
   * row (not the full AuthorMetadata graph the C# LazyLoaded chain built)
   * -- callers needing the author metadata fetch it themselves via
   * AuthorMetadataRepository.
   */
  findByBook(ids: number[]): Edition[] {
    if (ids.length === 0) {
      return [];
    }
    const placeholders = ids.map(() => "?").join(", ");
    const sql = `
      SELECT "Editions".*, "Books"."Id" as "Book_Id", "Books"."Title" as "Book_Title",
        "Books"."AuthorMetadataId" as "Book_AuthorMetadataId"
      FROM "Editions"
      LEFT JOIN "Books" ON "Editions"."BookId" = "Books"."Id"
      WHERE "Editions"."BookId" IN (${placeholders})
    `;
    const rows = this.db()
      .prepare(sql)
      .all(...ids.map((id) => toSqlValue(id))) as Record<string, unknown>[];

    return rows.map((row) => {
      const edition = this.rowToEdition(row);
      if (row["Book_Id"] !== null && row["Book_Id"] !== undefined) {
        edition.book = {
          id: row["Book_Id"] as number,
          title: row["Book_Title"] as string,
          authorMetadataId: row["Book_AuthorMetadataId"] as number,
        } as Edition["book"];
      }
      return edition;
    });
  }

  /** Ported from EditionRepository.FindByAuthor(int id): Editions -> Books -> Authors join on author Id. */
  findByAuthor(authorId: number): Edition[] {
    const sql = `
      SELECT "Editions".* FROM "Editions"
      JOIN "Books" ON "Editions"."BookId" = "Books"."Id"
      JOIN "Authors" ON "Books"."AuthorMetadataId" = "Authors"."AuthorMetadataId"
      WHERE "Authors"."Id" = ?
    `;
    const rows = this.db().prepare(sql).all(authorId) as Record<string, unknown>[];
    return rows.map((r) => this.rowToEdition(r));
  }

  /**
   * Ported from EditionRepository.FindByAuthorMetadataId(int
   * authorMetadataId, bool onlyMonitored). Note the C# `OrWhere` calls:
   * when `onlyMonitored` is true, the base AuthorMetadataId filter is
   * OR-combined with "Edition.Monitored" and "Book.AnyEditionOk" (an odd
   * but faithfully-preserved quirk of the original SqlBuilder chain --
   * `.Where(...).OrWhere(...).OrWhere(...)` produces `A OR B OR C`, not `A
   * AND (B OR C)`).
   */
  findByAuthorMetadataId(authorMetadataId: number, onlyMonitored: boolean): Edition[] {
    let sql = `
      SELECT "Editions".* FROM "Editions"
      JOIN "Books" ON "Editions"."BookId" = "Books"."Id"
      WHERE "Books"."AuthorMetadataId" = ?
    `;
    if (onlyMonitored) {
      sql += ' OR "Editions"."Monitored" = 1 OR "Books"."AnyEditionOk" = 1';
    }
    const rows = this.db().prepare(sql).all(authorMetadataId) as Record<string, unknown>[];
    return rows.map((r) => this.rowToEdition(r));
  }

  /** Ported from EditionRepository.FindByTitle(int authorMetadataId, string title): FirstOrDefault, not SingleOrDefault. */
  findByTitle(authorMetadataId: number, title: string): Edition | undefined {
    const sql = `
      SELECT "Editions".* FROM "Editions"
      JOIN "Books" ON "Editions"."BookId" = "Books"."Id"
      WHERE "Books"."AuthorMetadataId" = ? AND "Editions"."Monitored" = 1 AND "Editions"."Title" = ?
      LIMIT 1
    `;
    const row = this.db().prepare(sql).get(authorMetadataId, title) as
      Record<string, unknown> | undefined;
    return row ? this.rowToEdition(row) : undefined;
  }

  /**
   * Ported from EditionRepository.SetMonitored(Edition edition): sets
   * exactly one edition of the book (the given one) monitored, unmonitors
   * the rest, asserting exactly one ends up monitored (`Ensure.That(...
   * == 1).IsTrue()`).
   */
  setMonitored(edition: Edition): Edition[] {
    const allEditions = this.findByBook([edition.bookId]);
    for (const e of allEditions) {
      e.monitored = e.id === edition.id;
    }

    const monitoredCount = allEditions.filter((e) => e.monitored).length;
    if (monitoredCount !== 1) {
      throw new Error(`Expected exactly one monitored edition, got ${monitoredCount}`);
    }

    this.updateMany(allEditions);
    return allEditions;
  }
}

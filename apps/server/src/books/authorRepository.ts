/**
 * Ported from NzbDrone.Core/Books/Repositories/AuthorRepository.cs.
 *
 * Backing table: Authors (migration 0001 + 0019's MonitorNewItems column;
 * see db/migrations/0001_initial_setup.sql, 0019_add_new_item_monitor_type.sql).
 *
 * ## Deviation: no SqlBuilder-based join layer
 *
 * C#'s `AuthorRepository` overrode `Builder()`/`Query()` to always
 * left-join `Authors` to `AuthorMetadata` (so every `Author` returned by
 * any `Query(...)` call already has `.Metadata` populated) via
 * `SqlBuilder`/`_database.QueryJoined`. Phase 0's `BasicRepository` doesn't
 * carry that reflection-driven join machinery (see basic-repository.ts's
 * module doc comment: it's deferred to whichever concrete repository
 * actually needs it). This repository instead:
 *   - joins explicitly with hand-written SQL where the original always
 *     joined (`findById`, `all`/`get`/`find` overrides that hydrate
 *     `.metadata`), and
 *   - leaves `.metadata` unpopulated on results from the inherited
 *     `BasicRepository` methods (`all()`, `find()`, etc.) that don't
 *     override -- callers needing metadata call `findWithMetadata`-style
 *     methods below, or fetch it themselves via `AuthorMetadataRepository`.
 *
 * To keep this predictable rather than silently divergent from the C#
 * behavior (where literally every Query() came back metadata-populated),
 * every read method on this class is written to populate `.metadata`,
 * matching the original's actual behavior for those call sites.
 *
 * ## Deviation: JSON-embedded columns (Tags, AddOptions)
 *
 * Same issue and same fix as authorMetadataRepository.ts's module doc
 * comment: `Tags`/`AddOptions` are JSON text columns that
 * `BasicRepository`'s generic CRUD methods don't know to serialize, so
 * this class overrides them to serialize/deserialize at the boundary.
 */

import type { DatabaseSync } from "node:sqlite";
import type { IDatabase } from "../db/database.js";
import { BasicRepository, type ColumnMapping } from "../db/basic-repository.js";
import type { IEventAggregator } from "../db/events.js";
import { toSqlValue } from "../db/sql-value.js";
import type { Author, AuthorMetadata } from "./models.js";

const AUTHOR_COLUMNS: ColumnMapping<Author>[] = [
  { prop: "authorMetadataId", column: "AuthorMetadataId" },
  { prop: "cleanName", column: "CleanName" },
  { prop: "monitored", column: "Monitored", type: "boolean" },
  { prop: "monitorNewItems", column: "MonitorNewItems" },
  { prop: "lastInfoSync", column: "LastInfoSync" },
  { prop: "path", column: "Path" },
  { prop: "added", column: "Added" },
  { prop: "qualityProfileId", column: "QualityProfileId" },
  { prop: "metadataProfileId", column: "MetadataProfileId" },
  { prop: "tags", column: "Tags" },
  { prop: "addOptions", column: "AddOptions" },
];

/** Serializes the JSON-embedded fields (Tags, AddOptions) to strings, ready for BasicRepository's toSqlValue-based binding. */
function serialize(model: Author): Author {
  return {
    ...model,
    tags: JSON.stringify(model.tags) as unknown as number[],
    addOptions: (model.addOptions !== undefined
      ? JSON.stringify(model.addOptions)
      : null) as unknown as Author["addOptions"],
  };
}

/** Deserializes the JSON-embedded fields back from the strings BasicRepository read off the row. */
function deserialize(model: Author): Author {
  return {
    ...model,
    // Not a DB column -- BasicRepository's generic rowToModel() never
    // populates it (it's absent from AUTHOR_COLUMNS), so it comes back
    // `undefined` off the base class; default to "" for shape fidelity
    // with the Author interface. See models.ts's Author.rootFolderPath
    // doc comment.
    rootFolderPath: model.rootFolderPath ?? "",
    tags: parseOr<number[]>(model.tags as unknown as string, []),
    addOptions: parseOrUndefined(model.addOptions as unknown as string | null | undefined),
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

function parseOrUndefined<T>(value: string | null | undefined): T | undefined {
  if (value === null || value === undefined || value === "") {
    return undefined;
  }
  if (typeof value !== "string") {
    return value as unknown as T;
  }
  return JSON.parse(value) as T;
}

/** Row shape returned by the Authors <-> AuthorMetadata join queries below. */
interface AuthorMetadataRow {
  Id: number;
  ForeignAuthorId: string;
  TitleSlug: string;
  Name: string;
  SortName: string;
  NameLastFirst: string;
  SortNameLastFirst: string;
  Aliases: string;
  Overview: string | null;
  Disambiguation: string | null;
  Gender: string | null;
  Hometown: string | null;
  Born: string | null;
  Died: string | null;
  Status: number;
  Images: string;
  Links: string | null;
  Genres: string | null;
  Ratings: string | null;
}

function metadataRowToModel(row: AuthorMetadataRow): AuthorMetadata {
  return {
    id: row.Id,
    foreignAuthorId: row.ForeignAuthorId,
    titleSlug: row.TitleSlug,
    name: row.Name,
    sortName: row.SortName,
    nameLastFirst: row.NameLastFirst,
    sortNameLastFirst: row.SortNameLastFirst,
    aliases: row.Aliases ? JSON.parse(row.Aliases) : [],
    overview: row.Overview,
    disambiguation: row.Disambiguation,
    gender: row.Gender,
    hometown: row.Hometown,
    born: row.Born,
    died: row.Died,
    status: row.Status,
    images: row.Images ? JSON.parse(row.Images) : [],
    links: row.Links ? JSON.parse(row.Links) : [],
    genres: row.Genres ? JSON.parse(row.Genres) : [],
    ratings: row.Ratings ? JSON.parse(row.Ratings) : { votes: 0, value: 0 },
  };
}

export class AuthorRepository extends BasicRepository<Author> {
  constructor(database: IDatabase, eventAggregator?: IEventAggregator) {
    super(database, { tableName: "Authors", columns: AUTHOR_COLUMNS, eventAggregator });
  }

  private db(): DatabaseSync {
    return this.database.openConnection();
  }

  override all(): Author[] {
    return super.all().map(deserialize);
  }

  override find(id: number): Author | undefined {
    const model = super.find(id);
    return model ? deserialize(model) : undefined;
  }

  override get(id: number): Author {
    return deserialize(super.get(id));
  }

  override getMany(ids: number[]): Author[] {
    return super.getMany(ids).map(deserialize);
  }

  override single(): Author {
    return deserialize(super.single());
  }

  override singleOrDefault(): Author | undefined {
    const model = super.singleOrDefault();
    return model ? deserialize(model) : undefined;
  }

  override insert(model: Author): Author {
    return deserialize(super.insert(serialize(model)));
  }

  override insertMany(models: Author[]): Author[] {
    return super.insertMany(models.map(serialize)).map(deserialize);
  }

  override update(model: Author): Author {
    return deserialize(super.update(serialize(model)));
  }

  override updateMany(models: Author[]): void {
    super.updateMany(models.map(serialize));
  }

  override upsert(model: Author): Author {
    return deserialize(super.upsert(serialize(model)));
  }

  override setFields(model: Author, properties: (Exclude<keyof Author, "id"> & string)[]): void {
    super.setFields(serialize(model), properties);
  }

  private static readonly JOIN_SELECT = `
    SELECT
      "Authors"."Id" as "Id", "Authors"."AuthorMetadataId" as "AuthorMetadataId",
      "Authors"."CleanName" as "CleanName", "Authors"."Monitored" as "Monitored",
      "Authors"."MonitorNewItems" as "MonitorNewItems", "Authors"."LastInfoSync" as "LastInfoSync",
      "Authors"."Path" as "Path", "Authors"."Added" as "Added",
      "Authors"."QualityProfileId" as "QualityProfileId", "Authors"."MetadataProfileId" as "MetadataProfileId",
      "Authors"."Tags" as "Tags", "Authors"."AddOptions" as "AddOptions",
      "AuthorMetadata"."Id" as "Meta_Id", "AuthorMetadata"."ForeignAuthorId" as "Meta_ForeignAuthorId",
      "AuthorMetadata"."TitleSlug" as "Meta_TitleSlug", "AuthorMetadata"."Name" as "Meta_Name",
      "AuthorMetadata"."SortName" as "Meta_SortName", "AuthorMetadata"."NameLastFirst" as "Meta_NameLastFirst",
      "AuthorMetadata"."SortNameLastFirst" as "Meta_SortNameLastFirst", "AuthorMetadata"."Aliases" as "Meta_Aliases",
      "AuthorMetadata"."Overview" as "Meta_Overview", "AuthorMetadata"."Disambiguation" as "Meta_Disambiguation",
      "AuthorMetadata"."Gender" as "Meta_Gender", "AuthorMetadata"."Hometown" as "Meta_Hometown",
      "AuthorMetadata"."Born" as "Meta_Born", "AuthorMetadata"."Died" as "Meta_Died",
      "AuthorMetadata"."Status" as "Meta_Status", "AuthorMetadata"."Images" as "Meta_Images",
      "AuthorMetadata"."Links" as "Meta_Links", "AuthorMetadata"."Genres" as "Meta_Genres",
      "AuthorMetadata"."Ratings" as "Meta_Ratings"
    FROM "Authors"
    JOIN "AuthorMetadata" ON "Authors"."AuthorMetadataId" = "AuthorMetadata"."Id"
  `;

  private rowToAuthorWithMetadata(row: Record<string, unknown>): Author {
    const author: Author = {
      id: row["Id"] as number,
      authorMetadataId: row["AuthorMetadataId"] as number,
      cleanName: row["CleanName"] as string,
      monitored: Boolean(row["Monitored"]),
      monitorNewItems: row["MonitorNewItems"] as number,
      lastInfoSync: row["LastInfoSync"] as string | null,
      path: row["Path"] as string,
      rootFolderPath: "", // Not a DB column -- see models.ts's Author.rootFolderPath doc comment.
      added: row["Added"] as string | null,
      qualityProfileId: row["QualityProfileId"] as number,
      metadataProfileId: row["MetadataProfileId"] as number,
      tags: row["Tags"] ? JSON.parse(row["Tags"] as string) : [],
      addOptions: row["AddOptions"] ? JSON.parse(row["AddOptions"] as string) : undefined,
    };

    author.metadata = metadataRowToModel({
      Id: row["Meta_Id"] as number,
      ForeignAuthorId: row["Meta_ForeignAuthorId"] as string,
      TitleSlug: row["Meta_TitleSlug"] as string,
      Name: row["Meta_Name"] as string,
      SortName: row["Meta_SortName"] as string,
      NameLastFirst: row["Meta_NameLastFirst"] as string,
      SortNameLastFirst: row["Meta_SortNameLastFirst"] as string,
      Aliases: row["Meta_Aliases"] as string,
      Overview: row["Meta_Overview"] as string | null,
      Disambiguation: row["Meta_Disambiguation"] as string | null,
      Gender: row["Meta_Gender"] as string | null,
      Hometown: row["Meta_Hometown"] as string | null,
      Born: row["Meta_Born"] as string | null,
      Died: row["Meta_Died"] as string | null,
      Status: row["Meta_Status"] as number,
      Images: row["Meta_Images"] as string,
      Links: row["Meta_Links"] as string | null,
      Genres: row["Meta_Genres"] as string | null,
      Ratings: row["Meta_Ratings"] as string | null,
    });

    return author;
  }

  /** Ported from AuthorRepository.AuthorPathExists(string path): `Query(c => c.Path == path).Any()`. */
  authorPathExists(path: string): boolean {
    const row = this.db().prepare('SELECT 1 FROM "Authors" WHERE "Path" = ? LIMIT 1').get(path);
    return row !== undefined;
  }

  /** Ported from AuthorRepository.FindById(string foreignAuthorId): joined query, SingleOrDefault. */
  findById(foreignAuthorId: string): Author | undefined {
    const sql = `${AuthorRepository.JOIN_SELECT} WHERE "AuthorMetadata"."ForeignAuthorId" = ?`;
    const row = this.db().prepare(sql).get(foreignAuthorId) as Record<string, unknown> | undefined;
    return row ? this.rowToAuthorWithMetadata(row) : undefined;
  }

  /**
   * Ported from AuthorRepository.FindByName(string cleanName):
   * lower-invariants the input, then `Query(s => s.CleanName ==
   * cleanName).ExclusiveOrDefault()` -- returns the single match, or
   * undefined if zero or more-than-one rows match (NOT the same as
   * SingleOrDefault, which throws on >1 -- see db's ModelBase repository
   * doc comment for the distinction ExclusiveOrDefault makes in C#).
   */
  findByName(cleanName: string): Author | undefined {
    const lower = cleanName.toLowerCase();
    const sql = `${AuthorRepository.JOIN_SELECT} WHERE "Authors"."CleanName" = ?`;
    const rows = this.db().prepare(sql).all(lower) as Record<string, unknown>[];
    return rows.length === 1 ? this.rowToAuthorWithMetadata(rows[0]!) : undefined;
  }

  /** Ported from AuthorRepository.AllAuthorPaths(): raw `SELECT Id, Path FROM Authors` -> Dictionary. */
  allAuthorPaths(): Map<number, string> {
    const rows = this.db().prepare('SELECT "Id" as "Key", "Path" as "Value" FROM "Authors"').all() as {
      Key: number;
      Value: string;
    }[];
    return new Map(rows.map((r) => [r.Key, r.Value]));
  }

  /** Ported from AuthorRepository.AllAuthorTags(): raw query, only non-null Tags rows. */
  allAuthorTags(): Map<number, number[]> {
    const rows = this.db()
      .prepare('SELECT "Id" as "Key", "Tags" as "Value" FROM "Authors" WHERE "Tags" IS NOT NULL')
      .all() as { Key: number; Value: string }[];
    return new Map(rows.map((r) => [r.Key, JSON.parse(r.Value) as number[]]));
  }

  /** Ported from AuthorRepository.GetAuthorByMetadataId(int authorMetadataId): `Query(s => s.AuthorMetadataId == authorMetadataId).SingleOrDefault()`. */
  getAuthorByMetadataId(authorMetadataId: number): Author | undefined {
    const sql = `${AuthorRepository.JOIN_SELECT} WHERE "Authors"."AuthorMetadataId" = ?`;
    const row = this.db().prepare(sql).get(authorMetadataId) as Record<string, unknown> | undefined;
    return row ? this.rowToAuthorWithMetadata(row) : undefined;
  }

  /** Ported from AuthorRepository.GetAuthorsByMetadataId(IEnumerable<int> authorMetadataIds): `Query(s => authorMetadataIds.Contains(s.AuthorMetadataId))`. */
  getAuthorsByMetadataId(authorMetadataIds: number[]): Author[] {
    if (authorMetadataIds.length === 0) {
      return [];
    }
    const placeholders = authorMetadataIds.map(() => "?").join(", ");
    const sql = `${AuthorRepository.JOIN_SELECT} WHERE "Authors"."AuthorMetadataId" IN (${placeholders})`;
    const rows = this.db()
      .prepare(sql)
      .all(...authorMetadataIds.map((id) => toSqlValue(id))) as Record<string, unknown>[];
    return rows.map((r) => this.rowToAuthorWithMetadata(r));
  }

  /**
   * Not present on C#'s IAuthorRepository (which always joined via
   * Query()/Builder()) -- added so callers of this port's `all()` (which,
   * per this file's module doc comment, does NOT auto-join like the C#
   * override did) have an explicit way to get every Author with `.metadata`
   * populated, matching what `_authorRepository.All()` actually returned
   * in the original.
   */
  allWithMetadata(): Author[] {
    const rows = this.db().prepare(AuthorRepository.JOIN_SELECT).all() as Record<string, unknown>[];
    return rows.map((r) => this.rowToAuthorWithMetadata(r));
  }
}

/**
 * Ported from NzbDrone.Core/MediaFiles/MediaFileRepository.cs.
 *
 * Backing table: BookFiles (migration 0001 + 0010's Part column -- see
 * db/migrations/0001_initial_setup.sql, 0010_add_bookfile_part.sql). No new
 * migration needed: both columns already exist.
 *
 * ## Deviation: no SqlBuilder-based join layer
 *
 * C#'s `MediaFileRepository` overrides `Builder()` to ALWAYS left-join
 * BookFiles -> Editions -> Books -> Authors -> AuthorMetadata ("needed more
 * often than not so better to load it all now"), so every `Query(...)` call
 * comes back with `.Edition`/`.Edition.Book`/`.Author`/`.Author.Metadata`
 * populated. Same deviation and same fix as `books/authorRepository.ts`'s
 * module doc comment: Phase 0's `BasicRepository` has no reflection-driven
 * join machinery, so this repository joins explicitly with hand-written SQL
 * in each read method (matching the original's actual observable behavior:
 * every read here populates `.edition`/`.author` the same way the C# source
 * did), rather than leaving relations unpopulated the way the generic
 * inherited `BasicRepository` methods would.
 *
 * ## Deviation: JSON-embedded columns (Quality, MediaInfo)
 *
 * Same issue and fix as `books/bookRepository.ts`'s module doc comment:
 * `Quality`/`MediaInfo` are JSON text columns `BasicRepository`'s generic
 * CRUD doesn't know to serialize -- this class overrides insert/update/etc
 * to serialize/deserialize at the boundary, and every hand-written query
 * method below parses them manually in `rowToBookFile`.
 */

import type { DatabaseSync, SQLInputValue } from "node:sqlite";
import type { IDatabase } from "../db/database.js";
import { BasicRepository, type ColumnMapping } from "../db/basic-repository.js";
import type { IEventAggregator } from "../db/events.js";
import { toSqlValue } from "../db/sql-value.js";
import { pathEquals } from "../root-folders/path-utils.js";
import type { BookFile } from "./bookFile.js";
import { IndexerFlags } from "../parser/model/releaseInfo.js";
import { newQualityModel, type QualityModel } from "../qualities/qualityModel.js";
import { Quality } from "../qualities/quality.js";
import { Revision } from "../qualities/revision.js";

const BOOK_FILE_COLUMNS: ColumnMapping<BookFile>[] = [
  { prop: "editionId", column: "EditionId" },
  { prop: "calibreId", column: "CalibreId" },
  { prop: "quality", column: "Quality" },
  { prop: "size", column: "Size" },
  { prop: "sceneName", column: "SceneName" },
  { prop: "dateAdded", column: "DateAdded" },
  { prop: "releaseGroup", column: "ReleaseGroup" },
  { prop: "mediaInfo", column: "MediaInfo" },
  { prop: "modified", column: "Modified" },
  { prop: "path", column: "Path" },
  { prop: "part", column: "Part" },
];

function serializeQuality(quality: QualityModel): string {
  return JSON.stringify({
    quality: quality.quality.id,
    revision: {
      version: quality.revision.version,
      real: quality.revision.real,
      isRepack: quality.revision.isRepack,
    },
  });
}

/**
 * Deserializes the JSON-embedded Quality column. Accepts either the raw
 * DB string OR an already-deserialized `QualityModel` object and returns
 * it unchanged in the latter case -- idempotent, matching
 * `books/bookRepository.ts`'s `parseOr`'s `typeof value !== "string"`
 * early-return. This guard is required (not just defensive): `find()`/
 * `get()` overrides below call `super.get()`, which internally calls
 * `this.find(id)` via `BasicRepository`'s polymorphic dispatch -- i.e.
 * THIS class's own overridden `find()`, which already deserialized once.
 * Without this guard, `get()`'s second `deserialize()` pass would call
 * `JSON.parse()` on an already-parsed object and throw.
 */
function deserializeQuality(raw: string | QualityModel | null | undefined): QualityModel {
  if (raw === null || raw === undefined || raw === "") {
    return newQualityModel();
  }
  if (typeof raw !== "string") {
    return raw;
  }
  const parsed = JSON.parse(raw) as {
    quality: number;
    revision?: { version?: number; real?: number; isRepack?: boolean };
  };
  const quality =
    Quality.DefaultQualityDefinitions.find((d) => d.quality.id === parsed.quality)?.quality ??
    Quality.Unknown;
  const revision = new Revision({
    version: parsed.revision?.version ?? 1,
    real: parsed.revision?.real ?? 0,
    isRepack: parsed.revision?.isRepack ?? false,
  });
  return newQualityModel(quality, revision);
}

function serialize(model: BookFile): BookFile {
  return {
    ...model,
    quality: serializeQuality(model.quality) as unknown as QualityModel,
    mediaInfo: (model.mediaInfo !== null
      ? JSON.stringify(model.mediaInfo)
      : null) as unknown as BookFile["mediaInfo"],
  };
}

function deserialize(model: BookFile): BookFile {
  return {
    ...model,
    quality: deserializeQuality(model.quality),
    mediaInfo: parseOr(model.mediaInfo as unknown as string | null, null),
    indexerFlags: 0 as IndexerFlags,
    partCount: model.partCount ?? 0,
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

export class MediaFileRepository extends BasicRepository<BookFile> {
  constructor(database: IDatabase, eventAggregator?: IEventAggregator) {
    super(database, { tableName: "BookFiles", columns: BOOK_FILE_COLUMNS, eventAggregator });
  }

  private db(): DatabaseSync {
    return this.database.openConnection();
  }

  override all(): BookFile[] {
    return super.all().map(deserialize);
  }

  override find(id: number): BookFile | undefined {
    const model = super.find(id);
    return model ? deserialize(model) : undefined;
  }

  override get(id: number): BookFile {
    return deserialize(super.get(id));
  }

  override getMany(ids: number[]): BookFile[] {
    return super.getMany(ids).map(deserialize);
  }

  override insert(model: BookFile): BookFile {
    return deserialize(super.insert(serialize(model)));
  }

  override insertMany(models: BookFile[]): BookFile[] {
    return super.insertMany(models.map(serialize)).map(deserialize);
  }

  override update(model: BookFile): BookFile {
    return deserialize(super.update(serialize(model)));
  }

  override updateMany(models: BookFile[]): void {
    super.updateMany(models.map(serialize));
  }

  override upsert(model: BookFile): BookFile {
    return deserialize(super.upsert(serialize(model)));
  }

  override setFields(model: BookFile, properties: Exclude<keyof BookFile, "id">[]): void {
    super.setFields(serialize(model), properties);
  }

  private rowToBookFile(row: Record<string, unknown>): BookFile {
    return {
      id: row["Id"] as number,
      editionId: row["EditionId"] as number,
      calibreId: row["CalibreId"] as number,
      quality: deserializeQuality(row["Quality"] as string | null),
      size: row["Size"] as number,
      sceneName: row["SceneName"] as string | null,
      dateAdded: row["DateAdded"] as string,
      releaseGroup: row["ReleaseGroup"] as string | null,
      mediaInfo: parseOr(row["MediaInfo"] as string | null, null),
      modified: row["Modified"] as string,
      path: row["Path"] as string,
      part: row["Part"] as number,
      indexerFlags: 0 as IndexerFlags,
      partCount: 0,
      originalFilePath: null,
    };
  }

  /**
   * Ported from the always-joined `Builder()`/`Query()` pair: hydrates
   * `.edition` (with `.edition.book.author.metadata` nested) and
   * `.author` (with `.author.metadata`) on each row -- matching
   * `Map(file, edition, book, author, metadata)`'s field assignments.
   */
  private queryJoined(whereSql: string, params: SQLInputValue[]): BookFile[] {
    const sql = `
      SELECT
        "BookFiles".*,
        "Editions"."Id" as "e_Id", "Editions"."BookId" as "e_BookId", "Editions"."ForeignEditionId" as "e_ForeignEditionId",
        "Editions"."Title" as "e_Title", "Editions"."TitleSlug" as "e_TitleSlug",
        "Books"."Id" as "b_Id", "Books"."AuthorMetadataId" as "b_AuthorMetadataId", "Books"."ForeignBookId" as "b_ForeignBookId",
        "Books"."Title" as "b_Title",
        "Authors"."Id" as "a_Id", "Authors"."AuthorMetadataId" as "a_AuthorMetadataId", "Authors"."Path" as "a_Path",
        "Authors"."QualityProfileId" as "a_QualityProfileId", "Authors"."MetadataProfileId" as "a_MetadataProfileId",
        "AuthorMetadata"."Id" as "m_Id", "AuthorMetadata"."Name" as "m_Name", "AuthorMetadata"."ForeignAuthorId" as "m_ForeignAuthorId"
      FROM "BookFiles"
      LEFT JOIN "Editions" ON "BookFiles"."EditionId" = "Editions"."Id"
      LEFT JOIN "Books" ON "Editions"."BookId" = "Books"."Id"
      LEFT JOIN "Authors" ON "Books"."AuthorMetadataId" = "Authors"."AuthorMetadataId"
      LEFT JOIN "AuthorMetadata" ON "Authors"."AuthorMetadataId" = "AuthorMetadata"."Id"
      ${whereSql}
    `;

    const rows = this.db()
      .prepare(sql)
      .all(...params) as Record<string, unknown>[];

    return rows.map((row) => {
      const file = this.rowToBookFile(row);

      if (row["e_Id"] !== null && row["e_Id"] !== undefined) {
        const edition = {
          id: row["e_Id"] as number,
          bookId: row["e_BookId"] as number,
          foreignEditionId: row["e_ForeignEditionId"] as string,
          title: row["e_Title"] as string,
          titleSlug: row["e_TitleSlug"] as string,
        } as unknown as NonNullable<BookFile["edition"]>;

        if (row["b_Id"] !== null && row["b_Id"] !== undefined) {
          const book = {
            id: row["b_Id"] as number,
            authorMetadataId: row["b_AuthorMetadataId"] as number,
            foreignBookId: row["b_ForeignBookId"] as string,
            title: row["b_Title"] as string,
          } as unknown as NonNullable<NonNullable<BookFile["edition"]>["book"]>;

          if (row["a_Id"] !== null && row["a_Id"] !== undefined) {
            const author = {
              id: row["a_Id"] as number,
              authorMetadataId: row["a_AuthorMetadataId"] as number,
              path: row["a_Path"] as string,
              qualityProfileId: row["a_QualityProfileId"] as number,
              metadataProfileId: row["a_MetadataProfileId"] as number,
            } as unknown as NonNullable<BookFile["author"]>;

            if (row["m_Id"] !== null && row["m_Id"] !== undefined) {
              author.metadata = {
                id: row["m_Id"] as number,
                name: row["m_Name"] as string,
                foreignAuthorId: row["m_ForeignAuthorId"] as string,
              } as unknown as NonNullable<BookFile["author"]>["metadata"];
            }

            book.author = author;
            file.author = author;
          }

          edition.book = book;
        }

        file.edition = edition;
      }

      return file;
    });
  }

  /** Ported from `MediaFileRepository.GetFilesByAuthor(int authorId)`: `Builder().Where<Author>(a => a.Id == authorId)`. */
  getFilesByAuthor(authorId: number): BookFile[] {
    return this.queryJoined('WHERE "Authors"."Id" = ?', [authorId]);
  }

  /** Ported from `MediaFileRepository.GetFilesByAuthorMetadataId(int authorMetadataId)`. */
  getFilesByAuthorMetadataId(authorMetadataId: number): BookFile[] {
    return this.queryJoined('WHERE "Books"."AuthorMetadataId" = ?', [authorMetadataId]);
  }

  /** Ported from `MediaFileRepository.GetFilesByBook(int bookId)`. */
  getFilesByBook(bookId: number): BookFile[] {
    return this.queryJoined('WHERE "Books"."Id" = ?', [bookId]);
  }

  /** Ported from `MediaFileRepository.GetFilesByEdition(int editionId)`. */
  getFilesByEdition(editionId: number): BookFile[] {
    return this.queryJoined('WHERE "BookFiles"."EditionId" = ?', [editionId]);
  }

  /** Ported from `MediaFileRepository.GetUnmappedFiles()`: `_database.Query<BookFile>(...).Where(t => t.EditionId == 0)` -- NOT joined (matches the C# source's direct `_database.Query`, bypassing the overridden `Builder()`). */
  getUnmappedFiles(): BookFile[] {
    const rows = this.db()
      .prepare('SELECT * FROM "BookFiles" WHERE "EditionId" = 0')
      .all() as Record<string, unknown>[];
    return rows.map((r) => this.rowToBookFile(r));
  }

  /** Ported from `MediaFileRepository.DeleteFilesByBook(int bookId)`. */
  deleteFilesByBook(bookId: number): void {
    const fileIds = this.getFilesByBook(bookId).map((x) => x.id);
    if (fileIds.length === 0) {
      return;
    }
    const placeholders = fileIds.map(() => "?").join(", ");
    this.db()
      .prepare(`DELETE FROM "BookFiles" WHERE "Id" IN (${placeholders})`)
      .run(...fileIds.map((id) => toSqlValue(id)));
  }

  /** Ported from `MediaFileRepository.UnlinkFilesByBook(int bookId)`: sets EditionId = 0 on every file for the book. */
  unlinkFilesByBook(bookId: number): void {
    const files = this.getFilesByBook(bookId);
    for (const file of files) {
      this.setFields({ ...file, editionId: 0 }, ["editionId"]);
    }
  }

  /**
   * Ported from `MediaFileRepository.GetFilesWithBasePath(string path)`:
   * ensures the path ends with a single trailing separator before a
   * `StartsWith` match, avoiding partial-segment false positives (e.g.
   * "/music/foo" incorrectly matching a query for "/music/fo"). NOT joined
   * (matches the C# source's direct `_database.Query`).
   */
  getFilesWithBasePath(path: string): BookFile[] {
    const safePath = path.replace(/[/\\]+$/, "") + "/";
    const rows = this.db()
      .prepare('SELECT * FROM "BookFiles" WHERE "Path" LIKE ? ESCAPE \'\\\'')
      .all(escapeLike(safePath) + "%") as Record<string, unknown>[];
    return rows.map((r) => this.rowToBookFile(r)).filter((f) => f.path.startsWith(safePath));
  }

  /** Ported from `MediaFileRepository.GetFileWithPath(string path)`: `Query(x => x.Path == path).SingleOrDefault()` -- joined, matches the C# source's `Query(...)` overload (which goes through the overridden `Builder()`). */
  getFileWithPath(path: string): BookFile | undefined {
    const results = this.queryJoined('WHERE "BookFiles"."Path" = ?', [path]);
    if (results.length > 1) {
      throw new Error("Sequence contains more than one matching element");
    }
    return results[0];
  }

  /**
   * Ported from `MediaFileRepository.GetFileWithPath(List<string> paths)`:
   * "use more limited join for speed" -- joins BookFiles -> Editions ONLY
   * (not the full Author/AuthorMetadata chain), then matches against
   * `paths` via `PathEqualityComparer` (OS-aware path comparison, see
   * root-folders/path-utils.ts's `pathEquals`).
   */
  getFileWithPathList(paths: string[]): BookFile[] {
    if (paths.length === 0) {
      return [];
    }

    const sql = `
      SELECT "BookFiles".*, "Editions"."Id" as "e_Id", "Editions"."BookId" as "e_BookId",
        "Editions"."ForeignEditionId" as "e_ForeignEditionId", "Editions"."Title" as "e_Title",
        "Editions"."TitleSlug" as "e_TitleSlug"
      FROM "BookFiles"
      LEFT JOIN "Editions" ON "BookFiles"."EditionId" = "Editions"."Id"
    `;
    const rows = this.db().prepare(sql).all() as Record<string, unknown>[];

    const all = rows.map((row) => {
      const file = this.rowToBookFile(row);
      if (row["e_Id"] !== null && row["e_Id"] !== undefined) {
        file.edition = {
          id: row["e_Id"] as number,
          bookId: row["e_BookId"] as number,
          foreignEditionId: row["e_ForeignEditionId"] as string,
          title: row["e_Title"] as string,
          titleSlug: row["e_TitleSlug"] as string,
        } as unknown as NonNullable<BookFile["edition"]>;
      }
      return file;
    });

    return all.filter((file) => paths.some((p) => pathEquals(file.path, p)));
  }
}

/** Escapes SQL LIKE wildcard characters (`%`, `_`) in a literal string being used as a prefix match. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

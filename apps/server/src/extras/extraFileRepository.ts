import type { IDatabase } from "../db/database.js";
import { BasicRepository, type ColumnMapping } from "../db/basic-repository.js";
import type { IEventAggregator } from "../db/events.js";
import type { ExtraFile } from "./extraFile.js";

/**
 * Ported from NzbDrone.Core/Extras/Files/ExtraFileRepository.cs +
 * NzbDrone.Core/Datastore/BasicRepository.cs (the generic
 * `IBasicRepository<TExtraFile>` surface `IExtraFileRepository<TExtraFile>`
 * extends).
 *
 * C#'s `BasicRepository<TExtraFile>` used reflection to build INSERT/UPDATE
 * SQL from `TExtraFile`'s public properties, so a single generic base class
 * worked for any `ExtraFile` subclass without each one declaring its own
 * column list. This repo's `BasicRepository<TModel>`
 * (db/basic-repository.ts) has no reflection -- every concrete repository
 * must pass an explicit `ColumnMapping<TModel>[]` (see that file's module
 * doc comment) -- so this generic base takes the table name and the
 * subclass-specific extra columns (MetadataFile's `Hash`/`Consumer`/`Type`;
 * OtherExtraFile has none) as constructor parameters, and prepends the
 * common `ExtraFile` columns shared by every concrete extra-file table
 * (`AuthorId`, `BookFileId`, `BookId`, `RelativePath`, `Added`,
 * `LastUpdated`, `Extension`) itself. Concrete subclasses
 * (metadata/metadataFileRepository.ts, others/otherExtraFileRepository.ts)
 * only need to supply their own extra columns and row<->model mapping for
 * those extra fields.
 */
export const EXTRA_FILE_COLUMNS: ColumnMapping<ExtraFile>[] = [
  { prop: "authorId", column: "AuthorId" },
  { prop: "bookFileId", column: "BookFileId" },
  { prop: "bookId", column: "BookId" },
  { prop: "relativePath", column: "RelativePath" },
  { prop: "added", column: "Added" },
  { prop: "lastUpdated", column: "LastUpdated" },
  { prop: "extension", column: "Extension" },
];

export interface IExtraFileRepository<TExtraFile extends ExtraFile> {
  all(): TExtraFile[];
  find(id: number): TExtraFile | undefined;
  get(id: number): TExtraFile;
  getMany(ids: number[]): TExtraFile[];
  insert(model: TExtraFile): TExtraFile;
  insertMany(models: TExtraFile[]): TExtraFile[];
  update(model: TExtraFile): TExtraFile;
  updateMany(models: TExtraFile[]): void;
  upsert(model: TExtraFile): TExtraFile;
  delete(id: number): void;
  deleteMany(ids: number[]): void;
  count(): number;
  hasItems(): boolean;

  deleteForAuthor(authorId: number): void;
  deleteForBook(authorId: number, bookId: number): void;
  deleteForBookFile(bookFileId: number): void;
  getFilesByAuthor(authorId: number): TExtraFile[];
  getFilesByBook(authorId: number, bookId: number): TExtraFile[];
  getFilesByBookFile(bookFileId: number): TExtraFile[];
  findByPath(authorId: number, path: string): TExtraFile | undefined;
}

export class ExtraFileRepository<TExtraFile extends ExtraFile>
  extends BasicRepository<TExtraFile>
  implements IExtraFileRepository<TExtraFile>
{
  constructor(
    database: IDatabase,
    tableName: string,
    extraColumns: ColumnMapping<TExtraFile>[],
    eventAggregator?: IEventAggregator
  ) {
    super(database, {
      tableName,
      columns: [...(EXTRA_FILE_COLUMNS as ColumnMapping<TExtraFile>[]), ...extraColumns],
      eventAggregator,
    });
  }

  /** Ported from ExtraFileRepository.DeleteForAuthor(int authorId): Delete(c => c.AuthorId == authorId). */
  deleteForAuthor(authorId: number): void {
    this.deleteWhere((c) => c.authorId === authorId);
  }

  /** Ported from ExtraFileRepository.DeleteForBook(int authorId, int bookId). */
  deleteForBook(authorId: number, bookId: number): void {
    this.deleteWhere((c) => c.authorId === authorId && c.bookId === bookId);
  }

  /** Ported from ExtraFileRepository.DeleteForBookFile(int bookFileId). */
  deleteForBookFile(bookFileId: number): void {
    this.deleteWhere((c) => c.bookFileId === bookFileId);
  }

  /** Ported from ExtraFileRepository.GetFilesByAuthor(int authorId): Query(c => c.AuthorId == authorId). */
  getFilesByAuthor(authorId: number): TExtraFile[] {
    return this.all().filter((c) => c.authorId === authorId);
  }

  /** Ported from ExtraFileRepository.GetFilesByBook(int authorId, int bookId). */
  getFilesByBook(authorId: number, bookId: number): TExtraFile[] {
    return this.all().filter((c) => c.authorId === authorId && c.bookId === bookId);
  }

  /** Ported from ExtraFileRepository.GetFilesByBookFile(int bookFileId). */
  getFilesByBookFile(bookFileId: number): TExtraFile[] {
    return this.all().filter((c) => c.bookFileId === bookFileId);
  }

  /**
   * Ported from ExtraFileRepository.FindByPath(int authorId, string path):
   * `Query(...).SingleOrDefault()` -- throws if more than one row matches
   * (matching `Enumerable.SingleOrDefault`'s "more than one element"
   * exception), not just returning the first match.
   */
  findByPath(authorId: number, path: string): TExtraFile | undefined {
    const matches = this.all().filter((c) => c.authorId === authorId && c.relativePath === path);

    if (matches.length > 1) {
      throw new Error(`Sequence contains ${matches.length} elements, expected at most one`);
    }

    return matches[0];
  }

  /**
   * `BasicRepository<TModel>` (db/basic-repository.ts) has no bulk
   * predicate-based delete -- C#'s `Delete(Expression<Func<T, bool>>)`
   * relies on Dapper/SqlBuilder translating the LINQ predicate into a SQL
   * WHERE clause, which this repo's simpler repository doesn't support
   * (see that file's module doc comment re: SqlBuilder not being carried
   * over). Since every real call site here filters on already-loaded rows
   * (`AuthorId`/`BookId`/`BookFileId` equality, not arbitrary predicates),
   * this loads all rows, filters in memory, and bulk-deletes by id --
   * functionally identical to the SQL-side WHERE for this repository's
   * actual usage.
   */
  private deleteWhere(predicate: (model: TExtraFile) => boolean): void {
    const ids = this.all()
      .filter(predicate)
      .map((m) => m.id);
    this.deleteMany(ids);
  }
}

import type { DatabaseSync, SQLInputValue } from "node:sqlite";
import type { IDatabase } from "./database.js";
import type { ModelBase } from "./model-base.js";
import { PagingSpec, SortDirection } from "./paging-spec.js";
import { compileFilter, type FilterExpression } from "./filter.js";
import { ModelNotFoundException } from "./errors.js";
import { ModelAction, ModelEvent, NullEventAggregator, type IEventAggregator } from "./events.js";
import { toSqlValue } from "./sql-value.js";

/**
 * Ported from NzbDrone.Core/Datastore/BasicRepository.cs.
 *
 * ## The reflection problem and how this port adapts it
 *
 * C#'s BasicRepository<TModel> used reflection at construction time to:
 *   1. Look up the table name for TModel (TableMapping.Mapper.TableNameMapping)
 *   2. Enumerate TModel's public properties minus excluded/Id ones
 *   3. Build fixed INSERT/UPDATE SQL strings from that property list once,
 *      then reuse them via Dapper's object-to-parameter binding for every
 *      call.
 *
 * TypeScript/`node:sqlite` has no runtime type reflection and no
 * decorator-driven ORM here (ruled out per PORT_PLAN.md). So instead of
 * faking reflection, each concrete repository subclass explicitly declares:
 *   - `tableName`: the quoted-free SQL table name (string)
 *   - `columns`: the ordered list of DB column names EXCLUDING "Id" (the
 *     TS equivalent of C#'s `_properties` list after excluding the key
 *     property and any TableMapping-registered Ignore()'d properties)
 *
 * From that declared metadata, this class builds the exact same shape of
 * INSERT/UPDATE SQL that C#'s GetInsertSql()/GetUpdateSql() built, and the
 * same method surface (All/Get/Find/Insert/Update/Upsert/Delete/DeleteMany/
 * GetPaged/Count/HasItems/SetFields/Single/SingleOrDefault/InsertMany/
 * UpdateMany/Purge) with matching behavior:
 *   - Insert() throws if id !== 0 (can't insert an existing id)
 *   - Update()/SetFields() throw if id === 0 (can't update without an id)
 *   - Upsert() branches on id === 0 (insert) vs not (update)
 *   - Get(ids) throws if the returned row count doesn't match ids.length
 *     (ported from BasicRepository.Get(IEnumerable<int> ids)'s
 *     "Expected query to return N rows but returned M" ApplicationException)
 *   - GetPaged() applies FilterExpressions, defaults SortKey to the table's
 *     Id column, computes a 0-floored page offset, and populates both
 *     Records and TotalRecords on the same PagingSpec instance -- exactly
 *     matching BasicRepository.GetPaged()'s mutate-and-return-same-object
 *     behavior.
 *
 * Model<->row mapping: this repository maps between camelCase TS model
 * fields and PascalCase SQL columns (matching Readarr's actual column
 * naming, e.g. "AuthorMetadataId") via the `columns` list entries, which are
 * `{ prop, column }` pairs. `id` always maps to `"Id"`.
 *
 * The `Query()`/`QueryDistinct()`/`Builder()` SqlBuilder-based virtual hooks
 * from the C# base (meant for subclasses to override join behavior) are
 * intentionally not carried over 1:1 -- SqlBuilder.cs's clause-templating
 * approach is a general-purpose join/select builder for arbitrarily complex
 * per-repository queries (used heavily by domain repositories in later
 * phases). This Phase-0 port keeps BasicRepository's own CRUD/paging SQL
 * self-contained and simple; a richer SqlBuilder-equivalent query builder
 * can be layered in when a concrete domain repository (Phase 1+) actually
 * needs custom joins, without changing this class's public surface.
 */

export interface ColumnMapping<TModel> {
  /** TS model property name (camelCase). */
  prop: Exclude<keyof TModel, "id"> & string;
  /** SQL column name (PascalCase, matching Readarr's actual schema). */
  column: string;
  /**
   * SQLite has no boolean storage type -- it stores 0/1 integers, and
   * `node:sqlite` reads them back as plain `number`. C#/Dapper didn't have
   * this problem: it read the target `TModel` property's declared type via
   * reflection and coerced automatically. Without reflection, a column
   * whose model property is `boolean` needs to say so explicitly here so
   * `rowToModel()` can coerce the stored 0/1 back to `false`/`true`.
   */
  type?: "boolean";
}

export interface BasicRepositoryOptions<TModel extends ModelBase> {
  tableName: string;
  columns: ColumnMapping<TModel>[];
  eventAggregator?: IEventAggregator;
}

type Row = Record<string, unknown>;

export class BasicRepository<TModel extends ModelBase> {
  protected readonly database: IDatabase;
  protected readonly table: string;
  protected readonly columns: ColumnMapping<TModel>[];
  private readonly eventAggregator: IEventAggregator;

  private readonly insertSql: string;
  private readonly updateSql: string;

  constructor(database: IDatabase, options: BasicRepositoryOptions<TModel>) {
    this.database = database;
    this.table = options.tableName;
    this.columns = options.columns;
    this.eventAggregator = options.eventAggregator ?? new NullEventAggregator();

    this.insertSql = this.buildInsertSql();
    this.updateSql = this.buildUpdateSql(this.columns);
  }

  /** Ported from BasicRepository's `protected virtual bool PublishModelEvents => false;` */
  protected get publishModelEvents(): boolean {
    return false;
  }

  private conn(): DatabaseSync {
    return this.database.openConnection();
  }

  private rowToModel(row: Row): TModel {
    const model = { id: row["Id"] as number } as TModel;
    for (const { prop, column, type } of this.columns) {
      const value = row[column];
      (model as Record<string, unknown>)[prop] =
        type === "boolean" && value !== null ? Boolean(value) : value;
    }
    return model;
  }

  private modelToRow(model: TModel): Row {
    const row: Row = {};
    for (const { prop, column } of this.columns) {
      row[column] = (model as Record<string, unknown>)[prop] ?? null;
    }
    return row;
  }

  private buildInsertSql(): string {
    const columnList = this.columns.map(({ column }) => `"${column}"`).join(", ");
    const paramList = this.columns.map(() => "?").join(", ");
    return `INSERT INTO "${this.table}" (${columnList}) VALUES (${paramList})`;
  }

  private buildUpdateSql(columns: ColumnMapping<TModel>[]): string {
    const assignments = columns.map(({ column }) => `"${column}" = ?`).join(", ");
    return `UPDATE "${this.table}" SET ${assignments} WHERE "Id" = ?`;
  }

  // ---- Read ----

  all(): TModel[] {
    const rows = this.conn().prepare(`SELECT * FROM "${this.table}"`).all() as Row[];
    return rows.map((r) => this.rowToModel(r));
  }

  count(): number {
    const row = this.conn().prepare(`SELECT COUNT(*) as count FROM "${this.table}"`).get() as {
      count: number;
    };
    return row.count;
  }

  hasItems(): boolean {
    return this.count() > 0;
  }

  find(id: number): TModel | undefined {
    const row = this.conn()
      .prepare(`SELECT * FROM "${this.table}" WHERE "Id" = ?`)
      .get(id) as Row | undefined;
    return row ? this.rowToModel(row) : undefined;
  }

  get(id: number): TModel {
    const model = this.find(id);
    if (!model) {
      throw new ModelNotFoundException(this.table, id);
    }
    return model;
  }

  /**
   * Ported from BasicRepository.Get(IEnumerable<int> ids): throws if the
   * number of rows returned doesn't match the number of ids requested
   * (i.e. one or more ids didn't exist), matching the original's
   * "Expected query to return {ids.Count()} rows but returned {result.Count}"
   * ApplicationException.
   */
  getMany(ids: number[]): TModel[] {
    if (ids.length === 0) {
      return [];
    }

    const placeholders = ids.map(() => "?").join(", ");
    const rows = this.conn()
      .prepare(`SELECT * FROM "${this.table}" WHERE "Id" IN (${placeholders})`)
      .all(...ids) as Row[];

    if (rows.length !== ids.length) {
      throw new Error(`Expected query to return ${ids.length} rows but returned ${rows.length}`);
    }

    return rows.map((r) => this.rowToModel(r));
  }

  single(): TModel {
    const all = this.all();
    if (all.length !== 1) {
      throw new Error(`Sequence contains ${all.length} elements, expected exactly one`);
    }
    return all[0]!;
  }

  singleOrDefault(): TModel | undefined {
    const all = this.all();
    if (all.length > 1) {
      throw new Error(`Sequence contains ${all.length} elements, expected at most one`);
    }
    return all[0];
  }

  // ---- Write ----

  insert(model: TModel): TModel {
    if (model.id !== 0) {
      throw new Error(`Can't insert model with existing ID ${model.id}`);
    }

    const row = this.modelToRow(model);
    const params = this.columns.map(({ column }) => toSqlValue(row[column]));
    const result = this.conn().prepare(this.insertSql).run(...params);
    const inserted = { ...model, id: Number(result.lastInsertRowid) };

    this.modelCreated(inserted);

    return inserted;
  }

  insertMany(models: TModel[]): TModel[] {
    if (models.some((m) => m.id !== 0)) {
      throw new Error("Can't insert model with existing ID != 0");
    }

    const conn = this.conn();
    const stmt = conn.prepare(this.insertSql);
    const inserted: TModel[] = [];

    conn.exec("BEGIN");
    try {
      for (const model of models) {
        const row = this.modelToRow(model);
        const params = this.columns.map(({ column }) => toSqlValue(row[column]));
        const result = stmt.run(...params);
        inserted.push({ ...model, id: Number(result.lastInsertRowid) });
      }
      conn.exec("COMMIT");
    } catch (e) {
      conn.exec("ROLLBACK");
      throw e;
    }

    return inserted;
  }

  update(model: TModel): TModel {
    if (model.id === 0) {
      throw new Error("Can't update model with ID 0");
    }

    this.updateFields(model, this.columns);
    this.modelUpdated(model);

    return model;
  }

  updateMany(models: TModel[]): void {
    if (models.some((m) => m.id === 0)) {
      throw new Error("Can't update model with ID 0");
    }

    const conn = this.conn();
    conn.exec("BEGIN");
    try {
      for (const model of models) {
        this.updateFields(model, this.columns);
      }
      conn.exec("COMMIT");
    } catch (e) {
      conn.exec("ROLLBACK");
      throw e;
    }
  }

  private updateFields(model: TModel, columns: ColumnMapping<TModel>[]): void {
    const sql = columns === this.columns ? this.updateSql : this.buildUpdateSql(columns);
    const row = this.modelToRow(model);
    const params: SQLInputValue[] = [
      ...columns.map(({ column }) => toSqlValue(row[column])),
      model.id,
    ];
    this.conn().prepare(sql).run(...params);
  }

  /**
   * Ported from BasicRepository.SetFields(): partial update of only the
   * named properties, requiring an existing id (throws "Attempted to
   * update model without ID" otherwise, matching the C# message).
   */
  setFields(model: TModel, properties: (Exclude<keyof TModel, "id"> & string)[]): void {
    if (model.id === 0) {
      throw new Error("Attempted to update model without ID");
    }

    const columnsToUpdate = this.columns.filter(({ prop }) => properties.includes(prop));
    this.updateFields(model, columnsToUpdate);
    this.modelUpdated(model);
  }

  upsert(model: TModel): TModel {
    if (model.id === 0) {
      return this.insert(model);
    }

    return this.update(model);
  }

  // ---- Delete ----

  delete(modelOrId: TModel | number): void {
    const id = typeof modelOrId === "number" ? modelOrId : modelOrId.id;
    this.conn().prepare(`DELETE FROM "${this.table}" WHERE "Id" = ?`).run(id);
  }

  deleteMany(modelsOrIds: TModel[] | number[]): void {
    if (modelsOrIds.length === 0) {
      return;
    }

    const ids = modelsOrIds.map((m) => (typeof m === "number" ? m : m.id));
    const placeholders = ids.map(() => "?").join(", ");
    this.conn()
      .prepare(`DELETE FROM "${this.table}" WHERE "Id" IN (${placeholders})`)
      .run(...ids);
  }

  purge(vacuum = false): void {
    this.conn().exec(`DELETE FROM "${this.table}"`);

    if (vacuum) {
      this.database.vacuum();
    }
  }

  // ---- Paging ----

  private columnFor(field: string): string {
    if (field === "id") {
      return `"${this.table}"."Id"`;
    }
    const mapping = this.columns.find((c) => c.prop === field);
    if (!mapping) {
      throw new Error(`Unknown field "${field}" on table "${this.table}"`);
    }
    return `"${this.table}"."${mapping.column}"`;
  }

  /**
   * Ported from BasicRepository.GetPaged(). Mutates and returns the same
   * PagingSpec instance (matching the C# original's
   * `pagingSpec.Records = ...; pagingSpec.TotalRecords = ...; return pagingSpec;`).
   */
  getPaged(pagingSpec: PagingSpec<TModel>): PagingSpec<TModel> {
    const whereClause = this.buildWhereClause(pagingSpec.filterExpressions);

    const sortKey = pagingSpec.sortKey ?? "id";
    const sortColumn = this.columnFor(sortKey === `${this.table}.id` ? "id" : sortKey);
    const direction = pagingSpec.sortDirection === SortDirection.Descending ? "DESC" : "ASC";
    const pageOffset = Math.max(pagingSpec.page - 1, 0) * pagingSpec.pageSize;

    const recordsSql = `SELECT * FROM "${this.table}" ${whereClause.sql} ORDER BY ${sortColumn} ${direction} LIMIT ? OFFSET ?`;
    const rows = this.conn()
      .prepare(recordsSql)
      .all(...whereClause.params, pagingSpec.pageSize, pageOffset) as Row[];

    const countSql = `SELECT COUNT(*) as count FROM "${this.table}" ${whereClause.sql}`;
    const countRow = this.conn().prepare(countSql).get(...whereClause.params) as {
      count: number;
    };

    pagingSpec.records = rows.map((r) => this.rowToModel(r));
    pagingSpec.totalRecords = countRow.count;

    return pagingSpec;
  }

  private buildWhereClause(
    filters: FilterExpression<TModel>[]
  ): { sql: string; params: SQLInputValue[] } {
    if (filters.length === 0) {
      return { sql: "", params: [] };
    }

    const compiled = filters.map((f) => compileFilter(f, (field) => this.columnFor(field)));

    return {
      sql: "WHERE " + compiled.map((c) => c.sql).join(" AND "),
      params: compiled.flatMap((c) => c.params.map(toSqlValue)),
    };
  }

  // ---- Events ----

  protected modelCreated(model: TModel, forcePublish = false): void {
    this.publishModelEvent(model, ModelAction.Created, forcePublish);
  }

  protected modelUpdated(model: TModel, forcePublish = false): void {
    this.publishModelEvent(model, ModelAction.Updated, forcePublish);
  }

  protected modelDeleted(model: TModel, forcePublish = false): void {
    this.publishModelEvent(model, ModelAction.Deleted, forcePublish);
  }

  private publishModelEvent(model: TModel, action: ModelAction, forcePublish: boolean): void {
    if (this.publishModelEvents || forcePublish) {
      this.eventAggregator.publishEvent(new ModelEvent(model, action));
    }
  }
}

export { PagingSpec, SortDirection };

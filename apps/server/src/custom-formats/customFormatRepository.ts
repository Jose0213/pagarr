import type { DatabaseSync } from "node:sqlite";
import type { IDatabase } from "../db/database.js";
import { ModelNotFoundException } from "../db/errors.js";
import type { CustomFormat } from "./customFormat.js";
import {
  readSpecifications,
  writeSpecifications,
} from "./specifications/specificationSerializer.js";

type Row = {
  Id: number;
  Name: string;
  Specifications: string;
  IncludeCustomFormatWhenRenaming: number;
};

/**
 * Ported from NzbDrone.Core/CustomFormats/CustomFormatRepository.cs.
 *
 * `ICustomFormatRepository : IBasicRepository<CustomFormat>` had no members
 * of its own in C# -- a pure marker interface narrowing `BasicRepository<
 * CustomFormat>` for DI purposes. This repository would be a trivial
 * `BasicRepository<CustomFormat>` subclass (like TagRepository) except for
 * the `Specifications` column, which needs real (de)serialization through
 * `specificationSerializer.ts` -- the same "JSON column, so talk to
 * node:sqlite directly" deviation as `root-folders/root-folder-repository.ts`
 * and `profiles/qualities/qualityProfileRepository.ts` (see their doc
 * comments for why BasicRepository<TModel> can't be extended here: its
 * ColumnMapping only special-cases `boolean`, and its row<->model mapping is
 * private).
 *
 * Table: "CustomFormats" (db/migrations/0026_add_custom_formats.sql) --
 * `Id`, `Name` (UNIQUE), `Specifications` (TEXT, default '[]'),
 * `IncludeCustomFormatWhenRenaming` (INTEGER 0/1). Already exists; no new
 * migration needed for this module.
 *
 * No ModelEvent publication: like TagRepository, `CustomFormatRepository`
 * does not override BasicRepository's `protected virtual bool
 * PublishModelEvents => false`, so insert/update/delete never publish
 * row-level `ModelEvent`s (verified against the C# source -- no override
 * present). `CustomFormatService` publishes its own distinct
 * `CustomFormatAddedEvent`/`CustomFormatDeletedEvent` domain events instead
 * (see events.ts) -- that's the real Insert/Delete notification path in the
 * C# source, not BasicRepository's generic ModelEvent mechanism.
 */
export class CustomFormatRepository {
  constructor(private readonly database: IDatabase) {}

  private conn(): DatabaseSync {
    return this.database.openConnection();
  }

  private rowToModel(row: Row): CustomFormat {
    return {
      id: row.Id,
      name: row.Name,
      specifications: readSpecifications(row.Specifications),
      includeCustomFormatWhenRenaming: Boolean(row.IncludeCustomFormatWhenRenaming),
    };
  }

  all(): CustomFormat[] {
    const rows = this.conn().prepare('SELECT * FROM "CustomFormats"').all() as unknown as Row[];
    return rows.map((r) => this.rowToModel(r));
  }

  count(): number {
    const row = this.conn().prepare('SELECT COUNT(*) as count FROM "CustomFormats"').get() as {
      count: number;
    };
    return row.count;
  }

  hasItems(): boolean {
    return this.count() > 0;
  }

  find(id: number): CustomFormat | undefined {
    const row = this.conn().prepare('SELECT * FROM "CustomFormats" WHERE "Id" = ?').get(id) as
      Row | undefined;
    return row ? this.rowToModel(row) : undefined;
  }

  get(id: number): CustomFormat {
    const model = this.find(id);
    if (!model) {
      throw new ModelNotFoundException("CustomFormats", id);
    }
    return model;
  }

  /**
   * Ported from BasicRepository.Get(IEnumerable<int> ids): throws if the
   * number of rows returned doesn't match the number of ids requested.
   */
  getMany(ids: number[]): CustomFormat[] {
    if (ids.length === 0) {
      return [];
    }

    const placeholders = ids.map(() => "?").join(", ");
    const rows = this.conn()
      .prepare(`SELECT * FROM "CustomFormats" WHERE "Id" IN (${placeholders})`)
      .all(...ids) as unknown as Row[];

    if (rows.length !== ids.length) {
      throw new Error(`Expected query to return ${ids.length} rows but returned ${rows.length}`);
    }

    return rows.map((r) => this.rowToModel(r));
  }

  insert(model: CustomFormat): CustomFormat {
    if (model.id !== 0) {
      throw new Error(`Can't insert model with existing ID ${model.id}`);
    }

    const result = this.conn()
      .prepare(
        'INSERT INTO "CustomFormats" ("Name", "Specifications", "IncludeCustomFormatWhenRenaming") VALUES (?, ?, ?)'
      )
      .run(
        model.name,
        writeSpecifications(model.specifications),
        model.includeCustomFormatWhenRenaming ? 1 : 0
      );

    return { ...model, id: Number(result.lastInsertRowid) };
  }

  update(model: CustomFormat): CustomFormat {
    if (model.id === 0) {
      throw new Error("Can't update model with ID 0");
    }

    this.conn()
      .prepare(
        'UPDATE "CustomFormats" SET "Name" = ?, "Specifications" = ?, "IncludeCustomFormatWhenRenaming" = ? WHERE "Id" = ?'
      )
      .run(
        model.name,
        writeSpecifications(model.specifications),
        model.includeCustomFormatWhenRenaming ? 1 : 0,
        model.id
      );

    return model;
  }

  delete(idOrModel: number | CustomFormat): void {
    const id = typeof idOrModel === "number" ? idOrModel : idOrModel.id;
    this.conn().prepare('DELETE FROM "CustomFormats" WHERE "Id" = ?').run(id);
  }

  purge(): void {
    this.conn().exec('DELETE FROM "CustomFormats"');
  }
}

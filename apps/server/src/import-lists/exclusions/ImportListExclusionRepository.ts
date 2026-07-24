import type { DatabaseSync } from "node:sqlite";
import type { IDatabase } from "../../db/database.js";
import { ModelNotFoundException } from "../../db/errors.js";
import { createImportListExclusion, type ImportListExclusion } from "./ImportListExclusion.js";

type Row = {
  Id: number;
  ForeignId: string;
  Name: string;
};

/**
 * Ported from NzbDrone.Core/ImportLists/Exclusions/ImportListExclusionRepository.cs
 * (`BasicRepository<ImportListExclusion>` in C#, with two extra
 * `FindByForeignId` overloads).
 *
 * DEVIATION -- not built on the shared `BasicRepository<TModel>`: this
 * table has no boolean/JSON-embedded columns at all (just `ForeignId`/
 * `Name`, both plain text) so `BasicRepository` *could* have been used
 * directly here without any deviation -- this is hand-rolled instead purely
 * to keep the two `FindByForeignId` overloads (single id, and the
 * `Enumerable.Contains`-backed batch-id lookup C#'s comment explicitly notes
 * is written that way "to force the builder to create an IN and not a
 * string LIKE expression") next to straightforward, explicit SQL rather
 * than reaching for `BasicRepository`'s generic filter-expression builder
 * for a batch-IN query it wasn't designed around. Matches this module's
 * other narrow, explicit repositories (e.g. `IndexerRepository.ts`).
 */
export interface IImportListExclusionRepository {
  all(): ImportListExclusion[];
  find(id: number): ImportListExclusion | undefined;
  get(id: number): ImportListExclusion;
  insert(model: ImportListExclusion): ImportListExclusion;
  update(model: ImportListExclusion): ImportListExclusion;
  delete(id: number): void;
  findByForeignId(foreignId: string): ImportListExclusion | undefined;
  findByForeignIds(foreignIds: string[]): ImportListExclusion[];
}

export class ImportListExclusionRepository implements IImportListExclusionRepository {
  constructor(private readonly database: IDatabase) {}

  private conn(): DatabaseSync {
    return this.database.openConnection();
  }

  private rowToModel(row: Row): ImportListExclusion {
    return createImportListExclusion({
      id: row.Id,
      foreignId: row.ForeignId,
      name: row.Name,
    });
  }

  all(): ImportListExclusion[] {
    const rows = this.conn()
      .prepare('SELECT * FROM "ImportListExclusions"')
      .all() as unknown as Row[];
    return rows.map((r) => this.rowToModel(r));
  }

  find(id: number): ImportListExclusion | undefined {
    const row = this.conn()
      .prepare('SELECT * FROM "ImportListExclusions" WHERE "Id" = ?')
      .get(id) as Row | undefined;
    return row ? this.rowToModel(row) : undefined;
  }

  get(id: number): ImportListExclusion {
    const model = this.find(id);
    if (!model) {
      throw new ModelNotFoundException("ImportListExclusions", id);
    }
    return model;
  }

  insert(model: ImportListExclusion): ImportListExclusion {
    if (model.id !== 0) {
      throw new Error(`Can't insert model with existing ID ${model.id}`);
    }

    const result = this.conn()
      .prepare('INSERT INTO "ImportListExclusions" ("ForeignId", "Name") VALUES (?, ?)')
      .run(model.foreignId, model.name);

    return { ...model, id: Number(result.lastInsertRowid) };
  }

  update(model: ImportListExclusion): ImportListExclusion {
    if (model.id === 0) {
      throw new Error("Can't update model with ID 0");
    }

    this.conn()
      .prepare('UPDATE "ImportListExclusions" SET "ForeignId" = ?, "Name" = ? WHERE "Id" = ?')
      .run(model.foreignId, model.name, model.id);

    return model;
  }

  delete(id: number): void {
    this.conn().prepare('DELETE FROM "ImportListExclusions" WHERE "Id" = ?').run(id);
  }

  /** Ported from ImportListExclusionRepository.FindByForeignId(string): Query(m => m.ForeignId == foreignId).SingleOrDefault(). */
  findByForeignId(foreignId: string): ImportListExclusion | undefined {
    const row = this.conn()
      .prepare('SELECT * FROM "ImportListExclusions" WHERE "ForeignId" = ?')
      .get(foreignId) as Row | undefined;
    return row ? this.rowToModel(row) : undefined;
  }

  /**
   * Ported from ImportListExclusionRepository.FindByForeignId(List<string>):
   * `Query(x => Enumerable.Contains(ids, x.ForeignId))` -- an `IN` query, per
   * the C# comment's explicit intent.
   */
  findByForeignIds(foreignIds: string[]): ImportListExclusion[] {
    if (foreignIds.length === 0) {
      return [];
    }

    const placeholders = foreignIds.map(() => "?").join(", ");
    const rows = this.conn()
      .prepare(`SELECT * FROM "ImportListExclusions" WHERE "ForeignId" IN (${placeholders})`)
      .all(...foreignIds) as unknown as Row[];

    return rows.map((r) => this.rowToModel(r));
  }
}

import type { DatabaseSync } from "node:sqlite";
import type { IDatabase } from "../../db/database.js";
import { ModelNotFoundException } from "../../db/errors.js";
import { newReleaseProfile, type ReleaseProfile } from "./releaseProfile.js";

type Row = {
  Id: number;
  Required: string | null;
  Ignored: string | null;
  IndexerId: number;
  Tags: string;
  Enabled: number;
};

/**
 * Ported from NzbDrone.Core/Profiles/Releases/ReleaseProfileRepository.cs
 * (`IRestrictionRepository`/`ReleaseProfileRepository` -- the class name
 * "Restriction" is a historical holdover from before Release Profiles were
 * renamed from "Release Restrictions"; the interface/class themselves are
 * exactly the generic `IBasicRepository<ReleaseProfile>` with no extra
 * methods).
 *
 * DEVIATION: "Required"/"Ignored"/"Tags" are all JSON-serialized columns
 * (see this repo's ported 0026_add_custom_formats.sql migration, which
 * converted Required/Ignored from comma-separated strings to JSON arrays);
 * same reasoning as QualityProfileRepository/DelayProfileRepository for why
 * this bypasses BasicRepository<TModel> and talks to node:sqlite directly.
 */
export class ReleaseProfileRepository {
  constructor(private readonly database: IDatabase) {}

  private conn(): DatabaseSync {
    return this.database.openConnection();
  }

  private rowToModel(row: Row): ReleaseProfile {
    return newReleaseProfile({
      id: row.Id,
      enabled: Boolean(row.Enabled),
      required: row.Required ? (JSON.parse(row.Required) as string[]) : [],
      ignored: row.Ignored ? (JSON.parse(row.Ignored) as string[]) : [],
      indexerId: row.IndexerId,
      tags: new Set(JSON.parse(row.Tags) as number[]),
    });
  }

  all(): ReleaseProfile[] {
    const rows = this.conn().prepare('SELECT * FROM "ReleaseProfiles"').all() as unknown as Row[];
    return rows.map((r) => this.rowToModel(r));
  }

  find(id: number): ReleaseProfile | undefined {
    const row = this.conn().prepare('SELECT * FROM "ReleaseProfiles" WHERE "Id" = ?').get(id) as
      Row | undefined;
    return row ? this.rowToModel(row) : undefined;
  }

  get(id: number): ReleaseProfile {
    const model = this.find(id);
    if (!model) {
      throw new ModelNotFoundException("ReleaseProfiles", id);
    }
    return model;
  }

  insert(model: ReleaseProfile): ReleaseProfile {
    if (model.id !== 0) {
      throw new Error(`Can't insert model with existing ID ${model.id}`);
    }

    const result = this.conn()
      .prepare(
        'INSERT INTO "ReleaseProfiles" ("Required", "Ignored", "IndexerId", "Tags", "Enabled") VALUES (?, ?, ?, ?, ?)'
      )
      .run(
        JSON.stringify(model.required),
        JSON.stringify(model.ignored),
        model.indexerId,
        JSON.stringify(Array.from(model.tags)),
        model.enabled ? 1 : 0
      );

    return { ...model, id: Number(result.lastInsertRowid) };
  }

  update(model: ReleaseProfile): ReleaseProfile {
    if (model.id === 0) {
      throw new Error("Can't update model with ID 0");
    }

    this.conn()
      .prepare(
        'UPDATE "ReleaseProfiles" SET "Required" = ?, "Ignored" = ?, "IndexerId" = ?, "Tags" = ?, "Enabled" = ? WHERE "Id" = ?'
      )
      .run(
        JSON.stringify(model.required),
        JSON.stringify(model.ignored),
        model.indexerId,
        JSON.stringify(Array.from(model.tags)),
        model.enabled ? 1 : 0,
        model.id
      );

    return model;
  }

  delete(idOrModel: number | ReleaseProfile): void {
    const id = typeof idOrModel === "number" ? idOrModel : idOrModel.id;
    this.conn().prepare('DELETE FROM "ReleaseProfiles" WHERE "Id" = ?').run(id);
  }
}

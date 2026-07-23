import type { DatabaseSync } from "node:sqlite";
import type { IDatabase } from "../../db/database.js";
import { ModelNotFoundException } from "../../db/errors.js";
import { newMetadataProfile, type MetadataProfile } from "./metadataProfile.js";

type Row = {
  Id: number;
  Name: string;
  MinPopularity: number;
  SkipMissingDate: number;
  SkipMissingIsbn: number;
  SkipPartsAndSets: number;
  SkipSeriesSecondary: number;
  AllowedLanguages: string | null;
  MinPages: number;
  Ignored: string | null;
};

/**
 * Ported from NzbDrone.Core/Profiles/Metadata/MetadataProfileRepository.cs.
 *
 * DEVIATION: same reasoning as the other Profiles repositories -- "Ignored"
 * is a JSON-array column (see the ported 0033_metadata_profile_ignored_to_
 * list.sql migration), which BasicRepository's ColumnMapping can't
 * deserialize, so this bypasses it and talks to node:sqlite directly.
 * `Ignored` is nullable at the DB level (legacy rows created before
 * migration 008 added the column, or that never got the 033 backfill for
 * some other reason) -- treated as an empty array, matching how the C#
 * List<string> property would deserialize a NULL/missing JSON column via
 * the same "treat unset as default" convention used elsewhere in this
 * module (e.g. QualityProfile.FormatItems).
 */
export class MetadataProfileRepository {
  constructor(private readonly database: IDatabase) {}

  private conn(): DatabaseSync {
    return this.database.openConnection();
  }

  private rowToModel(row: Row): MetadataProfile {
    return newMetadataProfile({
      id: row.Id,
      name: row.Name,
      minPopularity: row.MinPopularity,
      skipMissingDate: Boolean(row.SkipMissingDate),
      skipMissingIsbn: Boolean(row.SkipMissingIsbn),
      skipPartsAndSets: Boolean(row.SkipPartsAndSets),
      skipSeriesSecondary: Boolean(row.SkipSeriesSecondary),
      allowedLanguages: row.AllowedLanguages,
      minPages: row.MinPages,
      ignored: row.Ignored ? (JSON.parse(row.Ignored) as string[]) : [],
    });
  }

  all(): MetadataProfile[] {
    const rows = this.conn().prepare('SELECT * FROM "MetadataProfiles"').all() as unknown as Row[];
    return rows.map((r) => this.rowToModel(r));
  }

  find(id: number): MetadataProfile | undefined {
    const row = this.conn().prepare('SELECT * FROM "MetadataProfiles" WHERE "Id" = ?').get(id) as
      Row | undefined;
    return row ? this.rowToModel(row) : undefined;
  }

  get(id: number): MetadataProfile {
    const model = this.find(id);
    if (!model) {
      throw new ModelNotFoundException("MetadataProfiles", id);
    }
    return model;
  }

  /** Ported from MetadataProfileRepository.Exists(int id): `Query(p => p.Id == id).Count == 1`. */
  exists(id: number): boolean {
    const row = this.conn()
      .prepare('SELECT COUNT(*) as count FROM "MetadataProfiles" WHERE "Id" = ?')
      .get(id) as { count: number };
    return row.count === 1;
  }

  insert(model: MetadataProfile): MetadataProfile {
    if (model.id !== 0) {
      throw new Error(`Can't insert model with existing ID ${model.id}`);
    }

    const result = this.conn()
      .prepare(
        'INSERT INTO "MetadataProfiles" ("Name", "MinPopularity", "SkipMissingDate", "SkipMissingIsbn", "SkipPartsAndSets", "SkipSeriesSecondary", "AllowedLanguages", "MinPages", "Ignored") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
      )
      .run(
        model.name,
        model.minPopularity,
        model.skipMissingDate ? 1 : 0,
        model.skipMissingIsbn ? 1 : 0,
        model.skipPartsAndSets ? 1 : 0,
        model.skipSeriesSecondary ? 1 : 0,
        model.allowedLanguages,
        model.minPages,
        JSON.stringify(model.ignored)
      );

    return { ...model, id: Number(result.lastInsertRowid) };
  }

  update(model: MetadataProfile): MetadataProfile {
    if (model.id === 0) {
      throw new Error("Can't update model with ID 0");
    }

    this.conn()
      .prepare(
        'UPDATE "MetadataProfiles" SET "Name" = ?, "MinPopularity" = ?, "SkipMissingDate" = ?, "SkipMissingIsbn" = ?, "SkipPartsAndSets" = ?, "SkipSeriesSecondary" = ?, "AllowedLanguages" = ?, "MinPages" = ?, "Ignored" = ? WHERE "Id" = ?'
      )
      .run(
        model.name,
        model.minPopularity,
        model.skipMissingDate ? 1 : 0,
        model.skipMissingIsbn ? 1 : 0,
        model.skipPartsAndSets ? 1 : 0,
        model.skipSeriesSecondary ? 1 : 0,
        model.allowedLanguages,
        model.minPages,
        JSON.stringify(model.ignored),
        model.id
      );

    return model;
  }

  delete(idOrModel: number | MetadataProfile): void {
    const id = typeof idOrModel === "number" ? idOrModel : idOrModel.id;
    this.conn().prepare('DELETE FROM "MetadataProfiles" WHERE "Id" = ?').run(id);
  }
}

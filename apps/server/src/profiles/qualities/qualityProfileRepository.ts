import type { DatabaseSync } from "node:sqlite";
import type { IDatabase } from "../../db/database.js";
import { ModelNotFoundException } from "../../db/errors.js";
import type { CustomFormat } from "../customFormat.js";
import type { ProfileFormatItem } from "../profileFormatItem.js";
import type { QualityProfile } from "./qualityProfile.js";

type Row = {
  Id: number;
  Name: string;
  Cutoff: number;
  Items: string;
  UpgradeAllowed: number | null;
  FormatItems: string;
  MinFormatScore: number;
  CutoffFormatScore: number;
};

/**
 * Ported from NzbDrone.Core/Profiles/Qualities/QualityProfileRepository.cs.
 *
 * DEVIATION -- not built on the shared BasicRepository<TModel>: this
 * repository's two JSON columns ("Items" and "FormatItems") need real
 * serialize/deserialize at the boundary, and BasicRepository's
 * ColumnMapping only knows how to coerce `boolean` columns (see
 * db/basic-repository.ts's ColumnMapping doc comment) -- it has no JSON
 * column type, and its row<->model mapping methods are private, so a
 * subclass can't extend that behavior in either direction. Rather than
 * change the shared Datastore module (out of scope for this module's
 * worktree -- see task brief), this repository talks to `node:sqlite`
 * directly, hand-rolling the same INSERT/UPDATE/SELECT shape
 * BasicRepository<QualityProfile> would have generated. Method surface
 * (all/get/insert/update/delete/exists/count) matches
 * IBasicRepository<QualityProfile> + IProfileRepository exactly, so this is
 * a drop-in for anything written against that C# interface.
 */
export class QualityProfileRepository {
  constructor(
    private readonly database: IDatabase,
    private readonly customFormatLookup: () => CustomFormat[] = () => []
  ) {}

  private conn(): DatabaseSync {
    return this.database.openConnection();
  }

  private rowToModel(row: Row): QualityProfile {
    return {
      id: row.Id,
      name: row.Name,
      cutoff: row.Cutoff,
      items: JSON.parse(row.Items) as QualityProfile["items"],
      upgradeAllowed: Boolean(row.UpgradeAllowed),
      formatItems: JSON.parse(row.FormatItems) as ProfileFormatItem[],
      minFormatScore: row.MinFormatScore,
      cutoffFormatScore: row.CutoffFormatScore,
    };
  }

  /**
   * Ported from QualityProfileRepository.Query(SqlBuilder builder): after
   * loading rows, re-hydrates each FormatItem's `Format` (stored as just an
   * id reference in the JSON, conceptually -- here the JSON already embeds
   * the full CustomFormat as last written) against the *current*
   * CustomFormats table, dropping any FormatItem whose CustomFormat no
   * longer exists ("Skip any format that has been removed, but the profile
   * wasn't updated properly").
   */
  private hydrate(profile: QualityProfile): QualityProfile {
    const customFormats = this.customFormatLookup();
    if (customFormats.length === 0 && profile.formatItems.length === 0) {
      return profile;
    }

    const byId = new Map(customFormats.map((c) => [c.id, c]));
    const formatItems = profile.formatItems
      .filter((item) => byId.has(item.format.id))
      .map((item) => ({ ...item, format: byId.get(item.format.id) as CustomFormat }));

    return { ...profile, formatItems };
  }

  all(): QualityProfile[] {
    const rows = this.conn().prepare('SELECT * FROM "QualityProfiles"').all() as unknown as Row[];
    return rows.map((r) => this.hydrate(this.rowToModel(r)));
  }

  count(): number {
    const row = this.conn().prepare('SELECT COUNT(*) as count FROM "QualityProfiles"').get() as {
      count: number;
    };
    return row.count;
  }

  find(id: number): QualityProfile | undefined {
    const row = this.conn().prepare('SELECT * FROM "QualityProfiles" WHERE "Id" = ?').get(id) as
      | Row
      | undefined;
    return row ? this.hydrate(this.rowToModel(row)) : undefined;
  }

  get(id: number): QualityProfile {
    const model = this.find(id);
    if (!model) {
      throw new ModelNotFoundException("QualityProfiles", id);
    }
    return model;
  }

  /** Ported from QualityProfileRepository.Exists(int id): `Query(p => p.Id == id).Count == 1`. */
  exists(id: number): boolean {
    const row = this.conn()
      .prepare('SELECT COUNT(*) as count FROM "QualityProfiles" WHERE "Id" = ?')
      .get(id) as { count: number };
    return row.count === 1;
  }

  insert(model: QualityProfile): QualityProfile {
    if (model.id !== 0) {
      throw new Error(`Can't insert model with existing ID ${model.id}`);
    }

    const result = this.conn()
      .prepare(
        'INSERT INTO "QualityProfiles" ("Name", "Cutoff", "Items", "UpgradeAllowed", "FormatItems", "MinFormatScore", "CutoffFormatScore") VALUES (?, ?, ?, ?, ?, ?, ?)'
      )
      .run(
        model.name,
        model.cutoff,
        JSON.stringify(model.items),
        model.upgradeAllowed ? 1 : 0,
        JSON.stringify(model.formatItems),
        model.minFormatScore,
        model.cutoffFormatScore
      );

    return { ...model, id: Number(result.lastInsertRowid) };
  }

  update(model: QualityProfile): QualityProfile {
    if (model.id === 0) {
      throw new Error("Can't update model with ID 0");
    }

    this.conn()
      .prepare(
        'UPDATE "QualityProfiles" SET "Name" = ?, "Cutoff" = ?, "Items" = ?, "UpgradeAllowed" = ?, "FormatItems" = ?, "MinFormatScore" = ?, "CutoffFormatScore" = ? WHERE "Id" = ?'
      )
      .run(
        model.name,
        model.cutoff,
        JSON.stringify(model.items),
        model.upgradeAllowed ? 1 : 0,
        JSON.stringify(model.formatItems),
        model.minFormatScore,
        model.cutoffFormatScore,
        model.id
      );

    return model;
  }

  delete(idOrModel: number | QualityProfile): void {
    const id = typeof idOrModel === "number" ? idOrModel : idOrModel.id;
    this.conn().prepare('DELETE FROM "QualityProfiles" WHERE "Id" = ?').run(id);
  }
}

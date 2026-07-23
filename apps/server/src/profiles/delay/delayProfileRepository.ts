import type { DatabaseSync } from "node:sqlite";
import type { IDatabase } from "../../db/database.js";
import { ModelNotFoundException } from "../../db/errors.js";
import { newDelayProfile, type DelayProfile } from "./delayProfile.js";

type Row = {
  Id: number;
  EnableUsenet: number;
  EnableTorrent: number;
  PreferredProtocol: number;
  UsenetDelay: number;
  TorrentDelay: number;
  Order: number;
  Tags: string;
  BypassIfHighestQuality: number;
  BypassIfAboveCustomFormatScore: number;
  MinimumCustomFormatScore: number | null;
};

/**
 * Ported from NzbDrone.Core/Profiles/Delay/DelayProfileRepository.cs.
 *
 * DEVIATION: same reasoning as QualityProfileRepository -- the "Tags"
 * column is a JSON-serialized array (C# stores `HashSet<int>` as JSON via
 * TableMapping's collection converter), which BasicRepository's
 * ColumnMapping has no support for, so this talks to node:sqlite directly
 * rather than extend BasicRepository<DelayProfile>. Method surface matches
 * IBasicRepository<DelayProfile> (the real C# interface has no extra
 * methods beyond the generic repository ones -- `IDelayProfileRepository`
 * adds nothing itself).
 */
export class DelayProfileRepository {
  constructor(private readonly database: IDatabase) {}

  private conn(): DatabaseSync {
    return this.database.openConnection();
  }

  private rowToModel(row: Row): DelayProfile {
    return newDelayProfile({
      id: row.Id,
      enableUsenet: Boolean(row.EnableUsenet),
      enableTorrent: Boolean(row.EnableTorrent),
      preferredProtocol: row.PreferredProtocol,
      usenetDelay: row.UsenetDelay,
      torrentDelay: row.TorrentDelay,
      order: row.Order,
      tags: new Set(JSON.parse(row.Tags) as number[]),
      bypassIfHighestQuality: Boolean(row.BypassIfHighestQuality),
      bypassIfAboveCustomFormatScore: Boolean(row.BypassIfAboveCustomFormatScore),
      minimumCustomFormatScore: row.MinimumCustomFormatScore,
    });
  }

  all(): DelayProfile[] {
    const rows = this.conn().prepare('SELECT * FROM "DelayProfiles"').all() as unknown as Row[];
    return rows.map((r) => this.rowToModel(r));
  }

  count(): number {
    const row = this.conn().prepare('SELECT COUNT(*) as count FROM "DelayProfiles"').get() as {
      count: number;
    };
    return row.count;
  }

  find(id: number): DelayProfile | undefined {
    const row = this.conn().prepare('SELECT * FROM "DelayProfiles" WHERE "Id" = ?').get(id) as
      | Row
      | undefined;
    return row ? this.rowToModel(row) : undefined;
  }

  get(id: number): DelayProfile {
    const model = this.find(id);
    if (!model) {
      throw new ModelNotFoundException("DelayProfiles", id);
    }
    return model;
  }

  insert(model: DelayProfile): DelayProfile {
    if (model.id !== 0) {
      throw new Error(`Can't insert model with existing ID ${model.id}`);
    }

    const result = this.conn()
      .prepare(
        'INSERT INTO "DelayProfiles" ("EnableUsenet", "EnableTorrent", "PreferredProtocol", "UsenetDelay", "TorrentDelay", "Order", "Tags", "BypassIfHighestQuality", "BypassIfAboveCustomFormatScore", "MinimumCustomFormatScore") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      )
      .run(
        model.enableUsenet ? 1 : 0,
        model.enableTorrent ? 1 : 0,
        model.preferredProtocol,
        model.usenetDelay,
        model.torrentDelay,
        model.order,
        JSON.stringify(Array.from(model.tags)),
        model.bypassIfHighestQuality ? 1 : 0,
        model.bypassIfAboveCustomFormatScore ? 1 : 0,
        model.minimumCustomFormatScore
      );

    return { ...model, id: Number(result.lastInsertRowid) };
  }

  update(model: DelayProfile): DelayProfile {
    if (model.id === 0) {
      throw new Error("Can't update model with ID 0");
    }

    this.conn()
      .prepare(
        'UPDATE "DelayProfiles" SET "EnableUsenet" = ?, "EnableTorrent" = ?, "PreferredProtocol" = ?, "UsenetDelay" = ?, "TorrentDelay" = ?, "Order" = ?, "Tags" = ?, "BypassIfHighestQuality" = ?, "BypassIfAboveCustomFormatScore" = ?, "MinimumCustomFormatScore" = ? WHERE "Id" = ?'
      )
      .run(
        model.enableUsenet ? 1 : 0,
        model.enableTorrent ? 1 : 0,
        model.preferredProtocol,
        model.usenetDelay,
        model.torrentDelay,
        model.order,
        JSON.stringify(Array.from(model.tags)),
        model.bypassIfHighestQuality ? 1 : 0,
        model.bypassIfAboveCustomFormatScore ? 1 : 0,
        model.minimumCustomFormatScore,
        model.id
      );

    return model;
  }

  updateMany(models: DelayProfile[]): void {
    if (models.some((m) => m.id === 0)) {
      throw new Error("Can't update model with ID 0");
    }

    const conn = this.conn();
    conn.exec("BEGIN");
    try {
      for (const model of models) {
        this.update(model);
      }
      conn.exec("COMMIT");
    } catch (e) {
      conn.exec("ROLLBACK");
      throw e;
    }
  }

  delete(idOrModel: number | DelayProfile): void {
    const id = typeof idOrModel === "number" ? idOrModel : idOrModel.id;
    this.conn().prepare('DELETE FROM "DelayProfiles" WHERE "Id" = ?').run(id);
  }
}

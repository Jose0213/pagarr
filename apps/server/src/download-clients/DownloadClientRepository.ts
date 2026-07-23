import type { DatabaseSync } from "node:sqlite";
import type { IDatabase } from "../db/database.js";
import { ModelNotFoundException } from "../db/errors.js";
import {
  createDownloadClientDefinition,
  type DownloadClientDefinition,
} from "./DownloadClientDefinition.js";
import type { IProviderConfig } from "../indexers/IIndexerSettings.js";

type Row = {
  Id: number;
  Enable: number;
  Name: string;
  Implementation: string;
  Settings: string | null;
  ConfigContract: string | null;
  Priority: number;
  RemoveCompletedDownloads: number;
  RemoveFailedDownloads: number;
  Tags: string | null;
};

/**
 * Ported from NzbDrone.Core/Download/DownloadClientRepository.cs +
 * NzbDrone.Core/ThingiProvider/ProviderRepository.cs.
 *
 * DEVIATION -- not built on the shared `BasicRepository<TModel>`: same
 * documented shape as `indexers/IndexerRepository.ts` (this table's
 * `Settings` column is a JSON-embedded `IProviderConfig` document needing
 * the runtime `Implementation` value to know which concrete settings type
 * to deserialize into, and `Tags` is a JSON-embedded `HashSet<int>`) --
 * talks to `node:sqlite` directly.
 *
 * `Protocol` is NOT a persisted column (see migration 0001 -- the
 * `DownloadClients` table has no such column), matching
 * `IndexerRepository.ts`'s identical omission of `Indexers.Protocol`: in C#
 * this is populated in-memory by `DownloadClientFactory.SetProviderCharacteristics()`
 * from the live `IDownloadClient` instance every time providers are loaded,
 * never round-tripped through the DB. This repository leaves it at
 * `createDownloadClientDefinition()`'s default (`DownloadProtocol.Unknown`,
 * i.e. `0`) on read; `DownloadClientFactory` is responsible for
 * re-populating it the same way (see DownloadClientFactory.ts).
 */
export interface IDownloadClientRepository {
  all(): DownloadClientDefinition[];
  find(id: number): DownloadClientDefinition | undefined;
  get(id: number): DownloadClientDefinition;
  getMany(ids: number[]): DownloadClientDefinition[];
  findByName(name: string): DownloadClientDefinition | undefined;
  insert(model: DownloadClientDefinition): DownloadClientDefinition;
  update(model: DownloadClientDefinition): DownloadClientDefinition;
  upsert(model: DownloadClientDefinition): DownloadClientDefinition;
  delete(id: number): void;
  count(): number;
}

/**
 * Unlike `indexers/IndexerRepository.ts`'s `Settings` column (nullable, `NULL`
 * on no-settings), `DownloadClients.Settings` is `NOT NULL` (see migration
 * 0001) -- `insert()`/`update()` below write `""` rather than `NULL` when a
 * model's `settings` is null, matching the column constraint. Both `null`
 * and `""` therefore need to map back to a `null` model value on read.
 */
function parseSettings(json: string | null): IProviderConfig | null {
  if (json === null || json === "") {
    return null;
  }
  return JSON.parse(json) as IProviderConfig;
}

export class DownloadClientRepository implements IDownloadClientRepository {
  constructor(private readonly database: IDatabase) {}

  private conn(): DatabaseSync {
    return this.database.openConnection();
  }

  private rowToModel(row: Row): DownloadClientDefinition {
    return createDownloadClientDefinition({
      id: row.Id,
      enable: Boolean(row.Enable),
      name: row.Name,
      implementation: row.Implementation,
      configContract: row.ConfigContract,
      settings: parseSettings(row.Settings),
      priority: row.Priority,
      removeCompletedDownloads: Boolean(row.RemoveCompletedDownloads),
      removeFailedDownloads: Boolean(row.RemoveFailedDownloads),
      tags: row.Tags ? (JSON.parse(row.Tags) as number[]) : [],
    });
  }

  all(): DownloadClientDefinition[] {
    const rows = this.conn().prepare('SELECT * FROM "DownloadClients"').all() as unknown as Row[];
    return rows.map((r) => this.rowToModel(r));
  }

  count(): number {
    const row = this.conn().prepare('SELECT COUNT(*) as count FROM "DownloadClients"').get() as {
      count: number;
    };
    return row.count;
  }

  find(id: number): DownloadClientDefinition | undefined {
    const row = this.conn().prepare('SELECT * FROM "DownloadClients" WHERE "Id" = ?').get(id) as
      Row | undefined;
    return row ? this.rowToModel(row) : undefined;
  }

  get(id: number): DownloadClientDefinition {
    const model = this.find(id);
    if (!model) {
      throw new ModelNotFoundException("DownloadClients", id);
    }
    return model;
  }

  getMany(ids: number[]): DownloadClientDefinition[] {
    if (ids.length === 0) {
      return [];
    }

    const placeholders = ids.map(() => "?").join(", ");
    const rows = this.conn()
      .prepare(`SELECT * FROM "DownloadClients" WHERE "Id" IN (${placeholders})`)
      .all(...ids) as unknown as Row[];

    if (rows.length !== ids.length) {
      throw new Error(`Expected query to return ${ids.length} rows but returned ${rows.length}`);
    }

    return rows.map((r) => this.rowToModel(r));
  }

  /** Ported from ProviderRepository's implicit `Name` uniqueness lookup used by ProviderFactory. */
  findByName(name: string): DownloadClientDefinition | undefined {
    const row = this.conn()
      .prepare('SELECT * FROM "DownloadClients" WHERE "Name" = ?')
      .get(name) as Row | undefined;
    return row ? this.rowToModel(row) : undefined;
  }

  insert(model: DownloadClientDefinition): DownloadClientDefinition {
    if (model.id !== 0) {
      throw new Error(`Can't insert model with existing ID ${model.id}`);
    }

    const result = this.conn()
      .prepare(
        'INSERT INTO "DownloadClients" ("Enable", "Name", "Implementation", "Settings", "ConfigContract", "Priority", "RemoveCompletedDownloads", "RemoveFailedDownloads", "Tags") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
      )
      .run(
        model.enable ? 1 : 0,
        model.name,
        model.implementation,
        model.settings ? JSON.stringify(model.settings) : "",
        model.configContract ?? "",
        model.priority,
        model.removeCompletedDownloads ? 1 : 0,
        model.removeFailedDownloads ? 1 : 0,
        JSON.stringify(model.tags)
      );

    return { ...model, id: Number(result.lastInsertRowid) };
  }

  update(model: DownloadClientDefinition): DownloadClientDefinition {
    if (model.id === 0) {
      throw new Error("Can't update model with ID 0");
    }

    this.conn()
      .prepare(
        'UPDATE "DownloadClients" SET "Enable" = ?, "Name" = ?, "Implementation" = ?, "Settings" = ?, "ConfigContract" = ?, "Priority" = ?, "RemoveCompletedDownloads" = ?, "RemoveFailedDownloads" = ?, "Tags" = ? WHERE "Id" = ?'
      )
      .run(
        model.enable ? 1 : 0,
        model.name,
        model.implementation,
        model.settings ? JSON.stringify(model.settings) : "",
        model.configContract ?? "",
        model.priority,
        model.removeCompletedDownloads ? 1 : 0,
        model.removeFailedDownloads ? 1 : 0,
        JSON.stringify(model.tags),
        model.id
      );

    return model;
  }

  upsert(model: DownloadClientDefinition): DownloadClientDefinition {
    return model.id === 0 ? this.insert(model) : this.update(model);
  }

  delete(id: number): void {
    this.conn().prepare('DELETE FROM "DownloadClients" WHERE "Id" = ?').run(id);
  }
}

import type { DatabaseSync } from "node:sqlite";
import type { IDatabase } from "../db/database.js";
import { ModelNotFoundException } from "../db/errors.js";
import type { IProviderConfig } from "./IProviderConfig.js";
import { NULL_CONFIG_INSTANCE } from "./NullConfig.js";
import type { IProviderRepository } from "./IProviderRepository.js";
import { createProviderDefinition, type ProviderDefinition } from "./ProviderDefinition.js";

type Row = {
  Id: number;
  Name: string;
  Implementation: string;
  Settings: string | null;
  ConfigContract: string | null;
  Enable: number | null;
  Tags: string | null;
};

/**
 * Ported from NzbDrone.Core/ThingiProvider/ProviderRepository.cs.
 *
 * This is the real generic base `IndexerRepository`/`DownloadClientRepository`
 * were each independently modeled after -- both siblings opted OUT of
 * `BasicRepository<TModel>` for the exact same reason documented here: the
 * `Settings` column is a JSON-embedded `IProviderConfig` document whose
 * concrete deserialization target depends on the *runtime* `Implementation`
 * value (C#'s `EmbeddedDocumentConverter<IProviderConfig>`, driven by
 * reflection via `typeof(IProviderConfig).Assembly.FindTypeByName(item.ConfigContract)`
 * -- see the real `ProviderRepository<TProviderDefinition>.Query()` read
 * above). This port has no reflection/type-registry equivalent, so --
 * matching this task's "explicit over reflection" instruction -- the
 * `settingsParser` constructor param takes that job explicitly: a callback
 * from `(configContract) => parser function` (or `undefined` if unknown),
 * mirroring `impType == null` falling back to `NullConfig.Instance` in the
 * C# original.
 *
 * A concrete subclass in a future provider-kind module (Notifications) can
 * either use this directly with its own `settingsParser`, or -- like
 * `IndexerRepository.ts`/`DownloadClientRepository.ts` already did before
 * this class existed -- write its own repository from scratch if its schema
 * has extra non-ProviderDefinition columns to map (this base only knows
 * about the fields `ProviderDefinition` itself declares: Name,
 * Implementation, Settings, ConfigContract, Enable, Tags -- NOT
 * ImplementationName or Message, which -- matching every sibling's own
 * documented omission -- are UI-display-only / in-memory-only and never
 * persisted columns in the real schema either).
 */
export interface ProviderRepositorySettingsParser<TProviderConfig extends IProviderConfig> {
  (configContract: string | null, json: string | null): TProviderConfig | null;
}

/** Default parser: returns NullConfig for missing/unrecognized contracts, matching the C# `impType == null` branch. */
export function defaultSettingsParser<TProviderConfig extends IProviderConfig>(
  configContract: string | null,
  json: string | null
): TProviderConfig | null {
  if (json === null || json.trim() === "" || configContract === null) {
    return NULL_CONFIG_INSTANCE as unknown as TProviderConfig;
  }
  return JSON.parse(json) as TProviderConfig;
}

export class ProviderRepository<
  TProviderConfig extends IProviderConfig = IProviderConfig,
> implements IProviderRepository<ProviderDefinition<TProviderConfig>> {
  constructor(
    private readonly database: IDatabase,
    private readonly tableName: string,
    private readonly settingsParser: ProviderRepositorySettingsParser<TProviderConfig> = defaultSettingsParser
  ) {}

  private conn(): DatabaseSync {
    return this.database.openConnection();
  }

  private rowToModel(row: Row): ProviderDefinition<TProviderConfig> {
    return createProviderDefinition<TProviderConfig>({
      id: row.Id,
      name: row.Name,
      implementation: row.Implementation,
      configContract: row.ConfigContract,
      settings: this.settingsParser(row.ConfigContract, row.Settings),
      enable: Boolean(row.Enable),
      tags: row.Tags ? (JSON.parse(row.Tags) as number[]) : [],
    });
  }

  all(): ProviderDefinition<TProviderConfig>[] {
    const rows = this.conn().prepare(`SELECT * FROM "${this.tableName}"`).all() as unknown as Row[];
    return rows.map((r) => this.rowToModel(r));
  }

  count(): number {
    const row = this.conn().prepare(`SELECT COUNT(*) as count FROM "${this.tableName}"`).get() as {
      count: number;
    };
    return row.count;
  }

  find(id: number): ProviderDefinition<TProviderConfig> | undefined {
    const row = this.conn().prepare(`SELECT * FROM "${this.tableName}" WHERE "Id" = ?`).get(id) as
      Row | undefined;
    return row ? this.rowToModel(row) : undefined;
  }

  get(id: number): ProviderDefinition<TProviderConfig> {
    const model = this.find(id);
    if (!model) {
      throw new ModelNotFoundException(this.tableName, id);
    }
    return model;
  }

  getMany(ids: number[]): ProviderDefinition<TProviderConfig>[] {
    if (ids.length === 0) {
      return [];
    }

    const placeholders = ids.map(() => "?").join(", ");
    const rows = this.conn()
      .prepare(`SELECT * FROM "${this.tableName}" WHERE "Id" IN (${placeholders})`)
      .all(...ids) as unknown as Row[];

    if (rows.length !== ids.length) {
      throw new Error(`Expected query to return ${ids.length} rows but returned ${rows.length}`);
    }

    return rows.map((r) => this.rowToModel(r));
  }

  insert(model: ProviderDefinition<TProviderConfig>): ProviderDefinition<TProviderConfig> {
    if (model.id !== 0) {
      throw new Error(`Can't insert model with existing ID ${model.id}`);
    }

    const result = this.conn()
      .prepare(
        `INSERT INTO "${this.tableName}" ("Name", "Implementation", "Settings", "ConfigContract", "Enable", "Tags") VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        model.name,
        model.implementation,
        model.settings ? JSON.stringify(model.settings) : null,
        model.configContract,
        model.enable ? 1 : 0,
        JSON.stringify(model.tags)
      );

    return { ...model, id: Number(result.lastInsertRowid) };
  }

  update(model: ProviderDefinition<TProviderConfig>): ProviderDefinition<TProviderConfig> {
    if (model.id === 0) {
      throw new Error("Can't update model with ID 0");
    }

    this.conn()
      .prepare(
        `UPDATE "${this.tableName}" SET "Name" = ?, "Implementation" = ?, "Settings" = ?, "ConfigContract" = ?, "Enable" = ?, "Tags" = ? WHERE "Id" = ?`
      )
      .run(
        model.name,
        model.implementation,
        model.settings ? JSON.stringify(model.settings) : null,
        model.configContract,
        model.enable ? 1 : 0,
        JSON.stringify(model.tags),
        model.id
      );

    return model;
  }

  updateMany(models: ProviderDefinition<TProviderConfig>[]): void {
    if (models.some((m) => m.id === 0)) {
      throw new Error("Can't update model with ID 0");
    }

    for (const model of models) {
      this.update(model);
    }
  }

  upsert(model: ProviderDefinition<TProviderConfig>): ProviderDefinition<TProviderConfig> {
    return model.id === 0 ? this.insert(model) : this.update(model);
  }

  delete(id: number): void {
    this.conn().prepare(`DELETE FROM "${this.tableName}" WHERE "Id" = ?`).run(id);
  }

  deleteMany(ids: number[]): void {
    if (ids.length === 0) {
      return;
    }
    const placeholders = ids.map(() => "?").join(", ");
    this.conn()
      .prepare(`DELETE FROM "${this.tableName}" WHERE "Id" IN (${placeholders})`)
      .run(...ids);
  }
}

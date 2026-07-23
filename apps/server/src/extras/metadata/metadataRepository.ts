import type { DatabaseSync } from "node:sqlite";
import type { IDatabase } from "../../db/database.js";
import { ModelNotFoundException } from "../../db/errors.js";
import { createMetadataDefinition, type MetadataDefinition } from "./metadataDefinition.js";

type Row = {
  Id: number;
  Enable: number;
  Name: string;
  Implementation: string;
  Settings: string;
  ConfigContract: string;
};

/**
 * Ported from NzbDrone.Core/Extras/Metadata/MetadataRepository.cs +
 * NzbDrone.Core/ThingiProvider/ProviderRepository.cs.
 *
 * DEVIATION -- not built on the shared `BasicRepository<TModel>`, same
 * rationale as indexers/IndexerRepository.ts: `Settings` is a
 * JSON-embedded document keyed by the runtime `Implementation` value, which
 * this repo's reflection-free `BasicRepository` can't special-case without
 * a generic `"json"` `ColumnMapping.type` (out of this module's scope).
 */
export interface IMetadataRepository {
  all(): MetadataDefinition[];
  find(id: number): MetadataDefinition | undefined;
  get(id: number): MetadataDefinition;
  getMany(ids: number[]): MetadataDefinition[];
  findByName(name: string): MetadataDefinition | undefined;
  insert(model: MetadataDefinition): MetadataDefinition;
  insertMany(models: MetadataDefinition[]): MetadataDefinition[];
  update(model: MetadataDefinition): MetadataDefinition;
  delete(id: number): void;
  count(): number;
}

function parseSettings(json: string | null): Record<string, unknown> | null {
  if (json === null || json === "") {
    return null;
  }
  return JSON.parse(json) as Record<string, unknown>;
}

export class MetadataRepository implements IMetadataRepository {
  constructor(private readonly database: IDatabase) {}

  private conn(): DatabaseSync {
    return this.database.openConnection();
  }

  private rowToModel(row: Row): MetadataDefinition {
    return createMetadataDefinition({
      id: row.Id,
      enable: Boolean(row.Enable),
      name: row.Name,
      implementation: row.Implementation,
      configContract: row.ConfigContract,
      settings: parseSettings(row.Settings),
    });
  }

  all(): MetadataDefinition[] {
    const rows = this.conn().prepare('SELECT * FROM "Metadata"').all() as unknown as Row[];
    return rows.map((r) => this.rowToModel(r));
  }

  count(): number {
    const row = this.conn().prepare('SELECT COUNT(*) as count FROM "Metadata"').get() as {
      count: number;
    };
    return row.count;
  }

  find(id: number): MetadataDefinition | undefined {
    const row = this.conn().prepare('SELECT * FROM "Metadata" WHERE "Id" = ?').get(id) as
      Row | undefined;
    return row ? this.rowToModel(row) : undefined;
  }

  get(id: number): MetadataDefinition {
    const model = this.find(id);
    if (!model) {
      throw new ModelNotFoundException("Metadata", id);
    }
    return model;
  }

  getMany(ids: number[]): MetadataDefinition[] {
    if (ids.length === 0) {
      return [];
    }

    const placeholders = ids.map(() => "?").join(", ");
    const rows = this.conn()
      .prepare(`SELECT * FROM "Metadata" WHERE "Id" IN (${placeholders})`)
      .all(...ids) as unknown as Row[];

    if (rows.length !== ids.length) {
      throw new Error(`Expected query to return ${ids.length} rows but returned ${rows.length}`);
    }

    return rows.map((r) => this.rowToModel(r));
  }

  findByName(name: string): MetadataDefinition | undefined {
    const row = this.conn().prepare('SELECT * FROM "Metadata" WHERE "Name" = ?').get(name) as
      Row | undefined;
    return row ? this.rowToModel(row) : undefined;
  }

  insert(model: MetadataDefinition): MetadataDefinition {
    if (model.id !== 0) {
      throw new Error(`Can't insert model with existing ID ${model.id}`);
    }

    const result = this.conn()
      .prepare(
        'INSERT INTO "Metadata" ("Enable", "Name", "Implementation", "Settings", "ConfigContract") VALUES (?, ?, ?, ?, ?)'
      )
      .run(
        model.enable ? 1 : 0,
        model.name,
        model.implementation,
        model.settings ? JSON.stringify(model.settings) : "{}",
        // Ported from ProviderDefinition.Settings's setter (`ConfigContract = value.GetType().Name`):
        // C# never actually persists a null ConfigContract (the Metadata.ConfigContract column is
        // NOT NULL -- see db/migrations/0001_initial_setup.sql) -- it's always the settings type's
        // name. This port's MetadataDefinition doesn't carry that type-name concept (no reflection),
        // so `configContract ?? ""` is the schema-safe equivalent: never null, matching the real
        // NOT NULL constraint, while remaining an honest "we don't have the real value" placeholder.
        model.configContract ?? ""
      );

    return { ...model, id: Number(result.lastInsertRowid) };
  }

  insertMany(models: MetadataDefinition[]): MetadataDefinition[] {
    return models.map((m) => this.insert(m));
  }

  update(model: MetadataDefinition): MetadataDefinition {
    if (model.id === 0) {
      throw new Error("Can't update model with ID 0");
    }

    this.conn()
      .prepare(
        'UPDATE "Metadata" SET "Enable" = ?, "Name" = ?, "Implementation" = ?, "Settings" = ?, "ConfigContract" = ? WHERE "Id" = ?'
      )
      .run(
        model.enable ? 1 : 0,
        model.name,
        model.implementation,
        model.settings ? JSON.stringify(model.settings) : "{}",
        model.configContract ?? "",
        model.id
      );

    return model;
  }

  delete(id: number): void {
    this.conn().prepare('DELETE FROM "Metadata" WHERE "Id" = ?').run(id);
  }
}

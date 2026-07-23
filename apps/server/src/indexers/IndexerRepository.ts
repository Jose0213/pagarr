import type { DatabaseSync } from "node:sqlite";
import type { IDatabase } from "../db/database.js";
import { ModelNotFoundException } from "../db/errors.js";
import { createIndexerDefinition, type IndexerDefinition } from "./IndexerDefinition.js";
import type { IProviderConfig } from "./IIndexerSettings.js";

type Row = {
  Id: number;
  Name: string;
  Implementation: string;
  Settings: string | null;
  ConfigContract: string | null;
  EnableRss: number | null;
  EnableAutomaticSearch: number | null;
  EnableInteractiveSearch: number;
  Tags: string | null;
  Priority: number;
  DownloadClientId: number;
};

/**
 * Ported from NzbDrone.Core/Indexers/IndexerRepository.cs +
 * NzbDrone.Core/ThingiProvider/ProviderRepository.cs.
 *
 * DEVIATION -- not built on the shared `BasicRepository<TModel>`: the
 * `Settings` column is a JSON-embedded `IProviderConfig` document (C#'s
 * `EmbeddedDocumentConverter<IProviderConfig>`, which needs the runtime
 * `Implementation` value to know *which* concrete settings type to
 * deserialize into -- reflection this port has no equivalent for) and
 * `Tags` is a JSON-embedded `HashSet<int>` -- same documented-deviation
 * shape as `root-folders/root-folder-repository.ts`. `Protocol`/
 * `SupportsRss`/`SupportsSearch` are NOT persisted columns (see migration
 * 0001: the `Indexers` table has no such columns) -- in C# these are
 * populated in-memory by `IndexerFactory.SetProviderCharacteristics()`
 * from the live `IIndexer` instance every time providers are loaded, never
 * round-tripped through the DB. This repository leaves them at their
 * `createIndexerDefinition()` defaults on read; whichever later phase ports
 * `IndexerFactory` is responsible for re-populating them the same way, per
 * this task's "narrow to the minimal interface actually needed, document
 * as forward-reference" guidance.
 *
 * `ImplementationName` (ProviderDefinition, ThingiProvider) has no backing
 * column either (UI-display-only, matches the same field's omission from
 * IndexerDefinition.ts).
 */
export interface IIndexerRepository {
  all(): IndexerDefinition[];
  find(id: number): IndexerDefinition | undefined;
  get(id: number): IndexerDefinition;
  getMany(ids: number[]): IndexerDefinition[];
  findByName(name: string): IndexerDefinition | undefined;
  insert(model: IndexerDefinition): IndexerDefinition;
  update(model: IndexerDefinition): IndexerDefinition;
  upsert(model: IndexerDefinition): IndexerDefinition;
  delete(id: number): void;
  count(): number;
}

/**
 * Parses the `Settings` column's raw JSON into a plain `IProviderConfig`
 * value (an object exposing at least `validate()` will be re-attached by
 * whichever concrete indexer settings type -- Torznab/Newznab -- owns
 * deserialization; this repository just round-trips the plain data shape).
 */
function parseSettings(json: string | null): IProviderConfig | null {
  if (json === null) {
    return null;
  }
  return JSON.parse(json) as IProviderConfig;
}

export class IndexerRepository implements IIndexerRepository {
  constructor(private readonly database: IDatabase) {}

  private conn(): DatabaseSync {
    return this.database.openConnection();
  }

  private rowToModel(row: Row): IndexerDefinition {
    return createIndexerDefinition({
      id: row.Id,
      name: row.Name,
      implementation: row.Implementation,
      configContract: row.ConfigContract,
      settings: parseSettings(row.Settings),
      tags: row.Tags ? (JSON.parse(row.Tags) as number[]) : [],
      enableRss: Boolean(row.EnableRss),
      enableAutomaticSearch: Boolean(row.EnableAutomaticSearch),
      enableInteractiveSearch: Boolean(row.EnableInteractiveSearch),
      downloadClientId: row.DownloadClientId,
      priority: row.Priority,
    });
  }

  all(): IndexerDefinition[] {
    const rows = this.conn().prepare('SELECT * FROM "Indexers"').all() as unknown as Row[];
    return rows.map((r) => this.rowToModel(r));
  }

  count(): number {
    const row = this.conn().prepare('SELECT COUNT(*) as count FROM "Indexers"').get() as {
      count: number;
    };
    return row.count;
  }

  find(id: number): IndexerDefinition | undefined {
    const row = this.conn().prepare('SELECT * FROM "Indexers" WHERE "Id" = ?').get(id) as
      Row | undefined;
    return row ? this.rowToModel(row) : undefined;
  }

  get(id: number): IndexerDefinition {
    const model = this.find(id);
    if (!model) {
      throw new ModelNotFoundException("Indexers", id);
    }
    return model;
  }

  getMany(ids: number[]): IndexerDefinition[] {
    if (ids.length === 0) {
      return [];
    }

    const placeholders = ids.map(() => "?").join(", ");
    const rows = this.conn()
      .prepare(`SELECT * FROM "Indexers" WHERE "Id" IN (${placeholders})`)
      .all(...ids) as unknown as Row[];

    if (rows.length !== ids.length) {
      throw new Error(`Expected query to return ${ids.length} rows but returned ${rows.length}`);
    }

    return rows.map((r) => this.rowToModel(r));
  }

  /** Ported from ProviderRepository's implicit `Name` uniqueness lookup used by ProviderFactory. */
  findByName(name: string): IndexerDefinition | undefined {
    const row = this.conn().prepare('SELECT * FROM "Indexers" WHERE "Name" = ?').get(name) as
      Row | undefined;
    return row ? this.rowToModel(row) : undefined;
  }

  insert(model: IndexerDefinition): IndexerDefinition {
    if (model.id !== 0) {
      throw new Error(`Can't insert model with existing ID ${model.id}`);
    }

    const result = this.conn()
      .prepare(
        'INSERT INTO "Indexers" ("Name", "Implementation", "Settings", "ConfigContract", "EnableRss", "EnableAutomaticSearch", "EnableInteractiveSearch", "Tags", "Priority", "DownloadClientId") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      )
      .run(
        model.name,
        model.implementation,
        model.settings ? JSON.stringify(model.settings) : null,
        model.configContract,
        model.enableRss ? 1 : 0,
        model.enableAutomaticSearch ? 1 : 0,
        model.enableInteractiveSearch ? 1 : 0,
        JSON.stringify(model.tags),
        model.priority,
        model.downloadClientId
      );

    return { ...model, id: Number(result.lastInsertRowid) };
  }

  update(model: IndexerDefinition): IndexerDefinition {
    if (model.id === 0) {
      throw new Error("Can't update model with ID 0");
    }

    this.conn()
      .prepare(
        'UPDATE "Indexers" SET "Name" = ?, "Implementation" = ?, "Settings" = ?, "ConfigContract" = ?, "EnableRss" = ?, "EnableAutomaticSearch" = ?, "EnableInteractiveSearch" = ?, "Tags" = ?, "Priority" = ?, "DownloadClientId" = ? WHERE "Id" = ?'
      )
      .run(
        model.name,
        model.implementation,
        model.settings ? JSON.stringify(model.settings) : null,
        model.configContract,
        model.enableRss ? 1 : 0,
        model.enableAutomaticSearch ? 1 : 0,
        model.enableInteractiveSearch ? 1 : 0,
        JSON.stringify(model.tags),
        model.priority,
        model.downloadClientId,
        model.id
      );

    return model;
  }

  upsert(model: IndexerDefinition): IndexerDefinition {
    return model.id === 0 ? this.insert(model) : this.update(model);
  }

  delete(id: number): void {
    this.conn().prepare('DELETE FROM "Indexers" WHERE "Id" = ?').run(id);
  }
}

import type { DatabaseSync } from "node:sqlite";
import type { IDatabase } from "../db/database.js";
import type { IProviderRepository } from "../thingi-provider/IProviderRepository.js";
import type { IImportListSettings } from "./IImportListSettings.js";
import {
  createImportListDefinition,
  ImportListMonitorType,
  type ImportListDefinition,
} from "./ImportListDefinition.js";

/**
 * Ported from NzbDrone.Core/ImportLists/ImportListRepository.cs +
 * NzbDrone.Core/ThingiProvider/ProviderRepository.cs.
 *
 * `ImportListRepository : ProviderRepository<ImportListDefinition>` in C#.
 * This module's task brief calls for extending the REAL
 * `thingi-provider/ProviderRepository.ts` where practical -- same as
 * `notifications/NotificationRepository.ts`'s doc comment explains, this
 * class is written standalone against the real `ImportLists` table schema
 * (migrations 0001, 0002, 0017, 0019) rather than subclassing
 * `ProviderRepository<TProviderConfig>` and fighting its private row-mapping
 * internals: this table has several extra, non-`ProviderDefinition` columns
 * (`EnableAutomaticAdd`, `RootFolderPath`, `ShouldMonitor`, `ProfileId`,
 * `MetadataProfileId`, `ShouldSearch`, `ShouldMonitorExisting`,
 * `MonitorNewItems`) that base's generic mapping has no way to know about.
 *
 * `ListType`/`MinRefreshInterval` are NOT persisted columns (confirmed
 * against migrations 0001/0002/0017/0019: no such columns exist) --
 * matching the real C# `ImportListFactory.SetProviderCharacteristics()`
 * behavior (stamped in-memory from the live provider instance every time,
 * same pattern as Indexers' `Protocol`/`SupportsRss`/`SupportsSearch` and
 * Notifications' `SupportsOnX` flags -- see those modules' repository doc
 * comments for the identical shape). This repository's row mapping leaves
 * them at `createImportListDefinition()`'s defaults on read;
 * `ImportListFactory.setProviderCharacteristicsFor()` (this module's
 * factory) is what actually populates them correctly before a definition is
 * used.
 */
export type IImportListRepository = IProviderRepository<ImportListDefinition>;

type Row = {
  Id: number;
  Name: string;
  Implementation: string;
  Settings: string | null;
  ConfigContract: string | null;
  EnableAutomaticAdd: number | null;
  RootFolderPath: string;
  ShouldMonitor: number;
  ProfileId: number;
  MetadataProfileId: number;
  Tags: string | null;
  ShouldSearch: number;
  ShouldMonitorExisting: number;
  MonitorNewItems: number;
};

const MONITOR_TYPE_BY_ORDINAL: readonly ImportListMonitorType[] = [
  ImportListMonitorType.None,
  ImportListMonitorType.SpecificBook,
  ImportListMonitorType.EntireAuthor,
];

const ORDINAL_BY_MONITOR_TYPE: Record<ImportListMonitorType, number> = {
  [ImportListMonitorType.None]: 0,
  [ImportListMonitorType.SpecificBook]: 1,
  [ImportListMonitorType.EntireAuthor]: 2,
};

/** Ordered to match this repository's INSERT/UPDATE column lists below. */
const WRITABLE_COLUMNS = [
  "Name",
  "Implementation",
  "Settings",
  "ConfigContract",
  "EnableAutomaticAdd",
  "RootFolderPath",
  "ShouldMonitor",
  "ProfileId",
  "MetadataProfileId",
  "Tags",
  "ShouldSearch",
  "ShouldMonitorExisting",
  "MonitorNewItems",
] as const;

export class ImportListRepository implements IImportListRepository {
  constructor(private readonly database: IDatabase) {}

  private conn(): DatabaseSync {
    return this.database.openConnection();
  }

  private rowToModel(row: Row): ImportListDefinition {
    return createImportListDefinition({
      id: row.Id,
      name: row.Name,
      implementation: row.Implementation,
      configContract: row.ConfigContract,
      settings: row.Settings ? (JSON.parse(row.Settings) as IImportListSettings) : null,
      tags: row.Tags ? (JSON.parse(row.Tags) as number[]) : [],
      enableAutomaticAdd: Boolean(row.EnableAutomaticAdd),
      rootFolderPath: row.RootFolderPath,
      shouldMonitor: MONITOR_TYPE_BY_ORDINAL[row.ShouldMonitor] ?? ImportListMonitorType.None,
      profileId: row.ProfileId,
      metadataProfileId: row.MetadataProfileId,
      shouldSearch: Boolean(row.ShouldSearch),
      shouldMonitorExisting: Boolean(row.ShouldMonitorExisting),
      monitorNewItems: row.MonitorNewItems,
      // enable is computed (see ImportListDefinition.ts's
      // computeImportListDefinitionEnable), not a stored column --
      // ProviderDefinition.Enable is a base `virtual` property
      // ImportListDefinition overrides with a getter in C#.
    });
  }

  private paramsFor(model: ImportListDefinition): (string | number | null)[] {
    return [
      model.name,
      model.implementation,
      model.settings ? JSON.stringify(model.settings) : null,
      model.configContract,
      model.enableAutomaticAdd ? 1 : 0,
      model.rootFolderPath,
      ORDINAL_BY_MONITOR_TYPE[model.shouldMonitor],
      model.profileId,
      model.metadataProfileId,
      JSON.stringify(model.tags),
      model.shouldSearch ? 1 : 0,
      model.shouldMonitorExisting ? 1 : 0,
      model.monitorNewItems,
    ];
  }

  all(): ImportListDefinition[] {
    const rows = this.conn().prepare('SELECT * FROM "ImportLists"').all() as unknown as Row[];
    return rows.map((r) => this.rowToModel(r));
  }

  count(): number {
    const row = this.conn().prepare('SELECT COUNT(*) as count FROM "ImportLists"').get() as {
      count: number;
    };
    return row.count;
  }

  find(id: number): ImportListDefinition | undefined {
    const row = this.conn().prepare('SELECT * FROM "ImportLists" WHERE "Id" = ?').get(id) as
      Row | undefined;
    return row ? this.rowToModel(row) : undefined;
  }

  get(id: number): ImportListDefinition {
    const model = this.find(id);
    if (!model) {
      throw new Error(`ImportListDefinition with id ${id} not found`);
    }
    return model;
  }

  getMany(ids: number[]): ImportListDefinition[] {
    if (ids.length === 0) {
      return [];
    }

    const placeholders = ids.map(() => "?").join(", ");
    const rows = this.conn()
      .prepare(`SELECT * FROM "ImportLists" WHERE "Id" IN (${placeholders})`)
      .all(...ids) as unknown as Row[];

    if (rows.length !== ids.length) {
      throw new Error(`Expected query to return ${ids.length} rows but returned ${rows.length}`);
    }

    return rows.map((r) => this.rowToModel(r));
  }

  insert(model: ImportListDefinition): ImportListDefinition {
    if (model.id !== 0) {
      throw new Error(`Can't insert model with existing ID ${model.id}`);
    }

    const columnList = WRITABLE_COLUMNS.map((c) => `"${c}"`).join(", ");
    const paramList = WRITABLE_COLUMNS.map(() => "?").join(", ");
    const result = this.conn()
      .prepare(`INSERT INTO "ImportLists" (${columnList}) VALUES (${paramList})`)
      .run(...this.paramsFor(model));

    return { ...model, id: Number(result.lastInsertRowid) };
  }

  update(model: ImportListDefinition): ImportListDefinition {
    if (model.id === 0) {
      throw new Error("Can't update model with ID 0");
    }

    const assignments = WRITABLE_COLUMNS.map((c) => `"${c}" = ?`).join(", ");
    this.conn()
      .prepare(`UPDATE "ImportLists" SET ${assignments} WHERE "Id" = ?`)
      .run(...this.paramsFor(model), model.id);

    return model;
  }

  updateMany(models: ImportListDefinition[]): void {
    if (models.some((m) => m.id === 0)) {
      throw new Error("Can't update model with ID 0");
    }

    for (const model of models) {
      this.update(model);
    }
  }

  upsert(model: ImportListDefinition): ImportListDefinition {
    return model.id === 0 ? this.insert(model) : this.update(model);
  }

  delete(id: number): void {
    this.conn().prepare('DELETE FROM "ImportLists" WHERE "Id" = ?').run(id);
  }

  deleteMany(ids: number[]): void {
    if (ids.length === 0) {
      return;
    }
    const placeholders = ids.map(() => "?").join(", ");
    this.conn()
      .prepare(`DELETE FROM "ImportLists" WHERE "Id" IN (${placeholders})`)
      .run(...ids);
  }
}

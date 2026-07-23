import type { DatabaseSync } from "node:sqlite";
import type { IDatabase } from "../db/database.js";
import type { IProviderConfig } from "../thingi-provider/IProviderConfig.js";
import type { IProviderRepository } from "../thingi-provider/IProviderRepository.js";
import {
  createNotificationDefinition,
  type NotificationDefinition,
} from "./NotificationDefinition.js";

/**
 * Ported from NzbDrone.Core/Notifications/NotificationRepository.cs +
 * NzbDrone.Core/ThingiProvider/ProviderRepository.cs.
 *
 * `NotificationRepository : ProviderRepository<NotificationDefinition>` in
 * C#. This module's task brief calls for extending the REAL
 * `thingi-provider/ProviderRepository.ts` rather than re-deriving a parallel
 * copy (per the brief: "Notifications' base classes should EXTEND/USE the
 * real ThingiProvider generics faithfully"). In practice that base's row
 * mapping only knows the columns plain `ProviderDefinition` declares (Name/
 * Implementation/Settings/ConfigContract/Enable/Tags -- see
 * `ProviderRepository.ts`'s own doc comment), so this class is written
 * standalone against the real `Notifications` table schema (migrations
 * 0001, 0004, 0021, 0025, 0038) rather than subclassing
 * `ProviderRepository<TProviderConfig>` and fighting its private row-mapping
 * internals -- the exact same choice `IndexerRepository`/
 * `DownloadClientStatusRepository` made for their own extra-column tables
 * (see e.g. `download-clients/DownloadClientStatusRepository.ts`'s doc
 * comment: "hand-rolled ... to exactly mirror ... this exact shape").
 *
 * `NotificationDefinition`'s `SupportsOnX` fields are NOT persisted columns
 * -- confirmed against the real `Notifications` CREATE TABLE (migration
 * 0001) plus every later `ALTER TABLE "Notifications"` migration (0004,
 * 0021, 0025, 0038): none of them add a `SupportsOnX` column. This matches
 * the real C# `NotificationFactory.SetProviderCharacteristics()` behavior
 * (see NotificationFactory.cs read earlier): those flags are stamped
 * in-memory onto the definition from the *live provider instance* every
 * time `GetInstance()`/`SetProviderCharacteristics()` runs, never
 * round-tripped through the DB. This repository's row mapping leaves them
 * at `createNotificationDefinition()`'s default (`false`) on read --
 * `NotificationFactory.setProviderCharacteristics()` (this module's
 * factory, not this repository) is what actually populates them correctly
 * before a definition is used, exactly mirroring the C# flow.
 *
 * `IncludeHealthWarnings` IS a persisted column (migration 0001) despite
 * having no `SupportsOnX`-style companion -- it's a genuine user-configurable
 * setting (whether Warning-level health checks, not just Errors, should
 * notify), not a capability flag.
 */
export type INotificationRepository = IProviderRepository<NotificationDefinition>;

type Row = {
  Id: number;
  Name: string;
  Implementation: string;
  Settings: string;
  ConfigContract: string | null;
  Tags: string | null;
  OnGrab: number;
  OnUpgrade: number | null;
  OnRename: number;
  OnReleaseImport: number;
  OnHealthIssue: number;
  IncludeHealthWarnings: number;
  OnDownloadFailure: number;
  OnImportFailure: number;
  OnBookRetag: number;
  OnAuthorDelete: number;
  OnBookDelete: number;
  OnBookFileDelete: number;
  OnBookFileDeleteForUpgrade: number;
  OnApplicationUpdate: number;
  OnAuthorAdded: number;
};

/** Ordered to match this repository's INSERT/UPDATE column lists below. */
const WRITABLE_COLUMNS = [
  "Name",
  "Implementation",
  "Settings",
  "ConfigContract",
  "Tags",
  "OnGrab",
  "OnUpgrade",
  "OnRename",
  "OnReleaseImport",
  "OnHealthIssue",
  "IncludeHealthWarnings",
  "OnDownloadFailure",
  "OnImportFailure",
  "OnBookRetag",
  "OnAuthorDelete",
  "OnBookDelete",
  "OnBookFileDelete",
  "OnBookFileDeleteForUpgrade",
  "OnApplicationUpdate",
  "OnAuthorAdded",
] as const;

export class NotificationRepository implements INotificationRepository {
  constructor(private readonly database: IDatabase) {}

  private conn(): DatabaseSync {
    return this.database.openConnection();
  }

  private rowToModel(row: Row): NotificationDefinition {
    return createNotificationDefinition({
      id: row.Id,
      name: row.Name,
      implementation: row.Implementation,
      configContract: row.ConfigContract,
      settings: row.Settings ? (JSON.parse(row.Settings) as IProviderConfig) : null,
      tags: row.Tags ? (JSON.parse(row.Tags) as number[]) : [],
      onGrab: Boolean(row.OnGrab),
      onUpgrade: Boolean(row.OnUpgrade),
      onRename: Boolean(row.OnRename),
      onReleaseImport: Boolean(row.OnReleaseImport),
      onHealthIssue: Boolean(row.OnHealthIssue),
      includeHealthWarnings: Boolean(row.IncludeHealthWarnings),
      onDownloadFailure: Boolean(row.OnDownloadFailure),
      onImportFailure: Boolean(row.OnImportFailure),
      onBookRetag: Boolean(row.OnBookRetag),
      onAuthorDelete: Boolean(row.OnAuthorDelete),
      onBookDelete: Boolean(row.OnBookDelete),
      onBookFileDelete: Boolean(row.OnBookFileDelete),
      onBookFileDeleteForUpgrade: Boolean(row.OnBookFileDeleteForUpgrade),
      onApplicationUpdate: Boolean(row.OnApplicationUpdate),
      onAuthorAdded: Boolean(row.OnAuthorAdded),
      // enable is computed (see NotificationDefinition.ts's computeNotificationDefinitionEnable),
      // not a stored column -- ProviderDefinition.Enable is a base `virtual`
      // property NotificationDefinition overrides with a getter in C#; see
      // NotificationDefinition.ts's doc comment for this port's substitute.
    });
  }

  private paramsFor(model: NotificationDefinition): (string | number | null)[] {
    return [
      model.name,
      model.implementation,
      model.settings ? JSON.stringify(model.settings) : "{}",
      model.configContract,
      JSON.stringify(model.tags),
      model.onGrab ? 1 : 0,
      model.onUpgrade ? 1 : 0,
      model.onRename ? 1 : 0,
      model.onReleaseImport ? 1 : 0,
      model.onHealthIssue ? 1 : 0,
      model.includeHealthWarnings ? 1 : 0,
      model.onDownloadFailure ? 1 : 0,
      model.onImportFailure ? 1 : 0,
      model.onBookRetag ? 1 : 0,
      model.onAuthorDelete ? 1 : 0,
      model.onBookDelete ? 1 : 0,
      model.onBookFileDelete ? 1 : 0,
      model.onBookFileDeleteForUpgrade ? 1 : 0,
      model.onApplicationUpdate ? 1 : 0,
      model.onAuthorAdded ? 1 : 0,
    ];
  }

  all(): NotificationDefinition[] {
    const rows = this.conn().prepare('SELECT * FROM "Notifications"').all() as unknown as Row[];
    return rows.map((r) => this.rowToModel(r));
  }

  count(): number {
    const row = this.conn().prepare('SELECT COUNT(*) as count FROM "Notifications"').get() as {
      count: number;
    };
    return row.count;
  }

  find(id: number): NotificationDefinition | undefined {
    const row = this.conn().prepare('SELECT * FROM "Notifications" WHERE "Id" = ?').get(id) as
      Row | undefined;
    return row ? this.rowToModel(row) : undefined;
  }

  get(id: number): NotificationDefinition {
    const model = this.find(id);
    if (!model) {
      throw new Error(`NotificationDefinition with id ${id} not found`);
    }
    return model;
  }

  getMany(ids: number[]): NotificationDefinition[] {
    if (ids.length === 0) {
      return [];
    }

    const placeholders = ids.map(() => "?").join(", ");
    const rows = this.conn()
      .prepare(`SELECT * FROM "Notifications" WHERE "Id" IN (${placeholders})`)
      .all(...ids) as unknown as Row[];

    if (rows.length !== ids.length) {
      throw new Error(`Expected query to return ${ids.length} rows but returned ${rows.length}`);
    }

    return rows.map((r) => this.rowToModel(r));
  }

  insert(model: NotificationDefinition): NotificationDefinition {
    if (model.id !== 0) {
      throw new Error(`Can't insert model with existing ID ${model.id}`);
    }

    const columnList = WRITABLE_COLUMNS.map((c) => `"${c}"`).join(", ");
    const paramList = WRITABLE_COLUMNS.map(() => "?").join(", ");
    const result = this.conn()
      .prepare(`INSERT INTO "Notifications" (${columnList}) VALUES (${paramList})`)
      .run(...this.paramsFor(model));

    return { ...model, id: Number(result.lastInsertRowid) };
  }

  update(model: NotificationDefinition): NotificationDefinition {
    if (model.id === 0) {
      throw new Error("Can't update model with ID 0");
    }

    const assignments = WRITABLE_COLUMNS.map((c) => `"${c}" = ?`).join(", ");
    this.conn()
      .prepare(`UPDATE "Notifications" SET ${assignments} WHERE "Id" = ?`)
      .run(...this.paramsFor(model), model.id);

    return model;
  }

  updateMany(models: NotificationDefinition[]): void {
    if (models.some((m) => m.id === 0)) {
      throw new Error("Can't update model with ID 0");
    }

    for (const model of models) {
      this.update(model);
    }
  }

  upsert(model: NotificationDefinition): NotificationDefinition {
    return model.id === 0 ? this.insert(model) : this.update(model);
  }

  delete(id: number): void {
    this.conn().prepare('DELETE FROM "Notifications" WHERE "Id" = ?').run(id);
  }

  deleteMany(ids: number[]): void {
    if (ids.length === 0) {
      return;
    }
    const placeholders = ids.map(() => "?").join(", ");
    this.conn()
      .prepare(`DELETE FROM "Notifications" WHERE "Id" IN (${placeholders})`)
      .run(...ids);
  }
}

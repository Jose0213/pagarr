import type { DatabaseSync } from "node:sqlite";
import type { IDatabase } from "../db/database.js";
import {
  createProviderStatusBase,
  type ProviderStatusBase,
} from "../thingi-provider/status/ProviderStatusBase.js";
import type { IProviderStatusRepositoryLike } from "../thingi-provider/status/ProviderStatusServiceBase.js";

type Row = {
  Id: number;
  ProviderId: number;
  InitialFailure: string | null;
  MostRecentFailure: string | null;
  EscalationLevel: number;
  DisabledTill: string | null;
};

/**
 * FORWARD-REF -- minimal `IProviderStatusRepositoryLike<ProviderStatusBase>`
 * implementations for the "ImportListStatus" and "NotificationStatus"
 * tables, needed only by `FixFutureImportListStatusTimes.cs` /
 * `FixFutureNotificationStatusTimes.cs`'s real C# constructors
 * (`IImportListStatusRepository` / `INotificationStatusRepository`).
 *
 * Both tables already exist in this port's schema (db/migrations's initial
 * setup + 0037_add_notification_status.sql), and both are structurally
 * exactly `ProviderStatusBase` (ImportListStatus additionally has a
 * `LastSyncListInfo` JSON column this task never reads/writes, so it's
 * omitted here -- same "narrow to what's actually used" convention as
 * `download-clients/DownloadClientStatus.ts`'s doc comment). Neither the
 * real `ImportLists` module (176+ files, PORT_PLAN Wave 2) nor
 * `Notifications` module (176 files, PORT_PLAN Wave 2) has been ported yet,
 * so there is no real `ImportListStatusRepository`/`NotificationStatusRepository`
 * to import -- these two small classes are the genuine forward-ref stand-ins
 * this module's task brief anticipated ("only forward-ref a stand-in for
 * something genuinely not ported yet"). They implement the real
 * `IProviderStatusRepositoryLike<TModel>` shape from the now-ported
 * ThingiProvider module against the real table, so `FixFutureImportListStatusTimes`
 * / `FixFutureNotificationStatusTimes` are fully functional today and a
 * future real ImportLists/Notifications module port can delete this file
 * and swap in its own repository with no change to the Fix* housekeeper
 * classes (same drop-in shape `IDownloadClientStatusRepository`/
 * `IIndexerStatusRepository` already satisfy).
 */
class TableProviderStatusRepository implements IProviderStatusRepositoryLike<ProviderStatusBase> {
  constructor(
    private readonly database: IDatabase,
    private readonly table: string
  ) {}

  private conn(): DatabaseSync {
    return this.database.openConnection();
  }

  private rowToModel(row: Row): ProviderStatusBase {
    return createProviderStatusBase({
      id: row.Id,
      providerId: row.ProviderId,
      initialFailure: row.InitialFailure,
      mostRecentFailure: row.MostRecentFailure,
      escalationLevel: row.EscalationLevel,
      disabledTill: row.DisabledTill,
    });
  }

  all(): ProviderStatusBase[] {
    const rows = this.conn().prepare(`SELECT * FROM "${this.table}"`).all() as unknown as Row[];
    return rows.map((r) => this.rowToModel(r));
  }

  findByProviderId(providerId: number): ProviderStatusBase | undefined {
    const row = this.conn()
      .prepare(`SELECT * FROM "${this.table}" WHERE "ProviderId" = ?`)
      .get(providerId) as Row | undefined;
    return row ? this.rowToModel(row) : undefined;
  }

  upsert(model: ProviderStatusBase): ProviderStatusBase {
    if (model.id === 0) {
      const result = this.conn()
        .prepare(
          `INSERT INTO "${this.table}" ("ProviderId", "InitialFailure", "MostRecentFailure", "EscalationLevel", "DisabledTill") VALUES (?, ?, ?, ?, ?)`
        )
        .run(
          model.providerId,
          model.initialFailure,
          model.mostRecentFailure,
          model.escalationLevel,
          model.disabledTill
        );

      return { ...model, id: Number(result.lastInsertRowid) };
    }

    this.conn()
      .prepare(
        `UPDATE "${this.table}" SET "ProviderId" = ?, "InitialFailure" = ?, "MostRecentFailure" = ?, "EscalationLevel" = ?, "DisabledTill" = ? WHERE "Id" = ?`
      )
      .run(
        model.providerId,
        model.initialFailure,
        model.mostRecentFailure,
        model.escalationLevel,
        model.disabledTill,
        model.id
      );

    return model;
  }

  deleteByProviderId(providerId: number): void {
    this.conn().prepare(`DELETE FROM "${this.table}" WHERE "ProviderId" = ?`).run(providerId);
  }
}

export class ImportListStatusRepositoryForCleanup extends TableProviderStatusRepository {
  constructor(database: IDatabase) {
    super(database, "ImportListStatus");
  }
}

export class NotificationStatusRepositoryForCleanup extends TableProviderStatusRepository {
  constructor(database: IDatabase) {
    super(database, "NotificationStatus");
  }
}

import type { DatabaseSync } from "node:sqlite";
import type { IDatabase } from "../db/database.js";
import { createDownloadClientStatus, type DownloadClientStatus } from "./DownloadClientStatus.js";

type Row = {
  Id: number;
  ProviderId: number;
  InitialFailure: string | null;
  MostRecentFailure: string | null;
  EscalationLevel: number;
  DisabledTill: string | null;
};

/**
 * Ported from NzbDrone.Core/Download/DownloadClientStatusRepository.cs +
 * NzbDrone.Core/ThingiProvider/Status/ProviderStatusRepository.cs.
 *
 * Unlike `indexers/IndexerStatusRepository.ts`, this table has no
 * JSON-embedded columns (no `LastRssSyncReleaseInfo` equivalent -- see
 * DownloadClientStatus.ts's doc comment), so unlike that repository this one
 * *could* sit on `BasicRepository<TModel>` -- but is hand-rolled here anyway
 * to exactly mirror `IndexerStatusRepository.ts`'s method surface
 * (find/findByProviderId/upsert/deleteByProviderId) 1:1, since
 * `DownloadClientStatusService.ts` is itself a close structural mirror of
 * `IndexerStatusService.ts` and depends on this exact shape.
 */
export interface IDownloadClientStatusRepository {
  all(): DownloadClientStatus[];
  find(id: number): DownloadClientStatus | undefined;
  findByProviderId(providerId: number): DownloadClientStatus | undefined;
  upsert(model: DownloadClientStatus): DownloadClientStatus;
  deleteByProviderId(providerId: number): void;
}

export class DownloadClientStatusRepository implements IDownloadClientStatusRepository {
  constructor(private readonly database: IDatabase) {}

  private conn(): DatabaseSync {
    return this.database.openConnection();
  }

  private rowToModel(row: Row): DownloadClientStatus {
    return createDownloadClientStatus({
      id: row.Id,
      providerId: row.ProviderId,
      initialFailure: row.InitialFailure,
      mostRecentFailure: row.MostRecentFailure,
      escalationLevel: row.EscalationLevel,
      disabledTill: row.DisabledTill,
    });
  }

  all(): DownloadClientStatus[] {
    const rows = this.conn()
      .prepare('SELECT * FROM "DownloadClientStatus"')
      .all() as unknown as Row[];
    return rows.map((r) => this.rowToModel(r));
  }

  find(id: number): DownloadClientStatus | undefined {
    const row = this.conn()
      .prepare('SELECT * FROM "DownloadClientStatus" WHERE "Id" = ?')
      .get(id) as Row | undefined;
    return row ? this.rowToModel(row) : undefined;
  }

  /** Ported from ProviderStatusRepository.FindByProviderId(): Query(c => c.ProviderId == providerId).SingleOrDefault(). */
  findByProviderId(providerId: number): DownloadClientStatus | undefined {
    const row = this.conn()
      .prepare('SELECT * FROM "DownloadClientStatus" WHERE "ProviderId" = ?')
      .get(providerId) as Row | undefined;
    return row ? this.rowToModel(row) : undefined;
  }

  upsert(model: DownloadClientStatus): DownloadClientStatus {
    if (model.id === 0) {
      const result = this.conn()
        .prepare(
          'INSERT INTO "DownloadClientStatus" ("ProviderId", "InitialFailure", "MostRecentFailure", "EscalationLevel", "DisabledTill") VALUES (?, ?, ?, ?, ?)'
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
        'UPDATE "DownloadClientStatus" SET "ProviderId" = ?, "InitialFailure" = ?, "MostRecentFailure" = ?, "EscalationLevel" = ?, "DisabledTill" = ? WHERE "Id" = ?'
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

  /** Ported from ProviderStatusRepository.DeleteByProviderId(): Delete(c => c.ProviderId == providerId). */
  deleteByProviderId(providerId: number): void {
    this.conn()
      .prepare('DELETE FROM "DownloadClientStatus" WHERE "ProviderId" = ?')
      .run(providerId);
  }
}

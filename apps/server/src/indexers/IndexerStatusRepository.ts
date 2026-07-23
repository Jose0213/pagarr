import type { DatabaseSync } from "node:sqlite";
import type { IDatabase } from "../db/database.js";
import { createIndexerStatus, type IndexerStatus } from "./IndexerStatus.js";
import type { ReleaseInfo } from "./releaseInfo.js";

type Row = {
  Id: number;
  ProviderId: number;
  InitialFailure: string | null;
  MostRecentFailure: string | null;
  EscalationLevel: number;
  DisabledTill: string | null;
  LastRssSyncReleaseInfo: string | null;
};

/**
 * Ported from NzbDrone.Core/Indexers/IndexerStatusRepository.cs +
 * NzbDrone.Core/ThingiProvider/Status/ProviderStatusRepository.cs.
 *
 * DEVIATION -- not built on the shared `BasicRepository<TModel>`: this
 * table's `LastRssSyncReleaseInfo` column is a JSON-embedded `ReleaseInfo`
 * document (C#'s `EmbeddedDocumentConverter<ReleaseInfo>`), and
 * `BasicRepository`'s `ColumnMapping` only special-cases `boolean` columns
 * (see db/basic-repository.ts's doc comment) -- same documented deviation
 * shape as `root-folders/root-folder-repository.ts` and
 * `profiles/qualities/qualityProfileRepository.ts`.
 */
export interface IIndexerStatusRepository {
  all(): IndexerStatus[];
  find(id: number): IndexerStatus | undefined;
  findByProviderId(providerId: number): IndexerStatus | undefined;
  upsert(model: IndexerStatus): IndexerStatus;
  deleteByProviderId(providerId: number): void;
}

export class IndexerStatusRepository implements IIndexerStatusRepository {
  constructor(private readonly database: IDatabase) {}

  private conn(): DatabaseSync {
    return this.database.openConnection();
  }

  private rowToModel(row: Row): IndexerStatus {
    return createIndexerStatus({
      id: row.Id,
      providerId: row.ProviderId,
      initialFailure: row.InitialFailure,
      mostRecentFailure: row.MostRecentFailure,
      escalationLevel: row.EscalationLevel,
      disabledTill: row.DisabledTill,
      lastRssSyncReleaseInfo: row.LastRssSyncReleaseInfo
        ? (JSON.parse(row.LastRssSyncReleaseInfo) as ReleaseInfo)
        : null,
    });
  }

  all(): IndexerStatus[] {
    const rows = this.conn().prepare('SELECT * FROM "IndexerStatus"').all() as unknown as Row[];
    return rows.map((r) => this.rowToModel(r));
  }

  find(id: number): IndexerStatus | undefined {
    const row = this.conn().prepare('SELECT * FROM "IndexerStatus" WHERE "Id" = ?').get(id) as
      Row | undefined;
    return row ? this.rowToModel(row) : undefined;
  }

  /** Ported from ProviderStatusRepository.FindByProviderId(): Query(c => c.ProviderId == providerId).SingleOrDefault(). */
  findByProviderId(providerId: number): IndexerStatus | undefined {
    const row = this.conn()
      .prepare('SELECT * FROM "IndexerStatus" WHERE "ProviderId" = ?')
      .get(providerId) as Row | undefined;
    return row ? this.rowToModel(row) : undefined;
  }

  upsert(model: IndexerStatus): IndexerStatus {
    if (model.id === 0) {
      const result = this.conn()
        .prepare(
          'INSERT INTO "IndexerStatus" ("ProviderId", "InitialFailure", "MostRecentFailure", "EscalationLevel", "DisabledTill", "LastRssSyncReleaseInfo") VALUES (?, ?, ?, ?, ?, ?)'
        )
        .run(
          model.providerId,
          model.initialFailure,
          model.mostRecentFailure,
          model.escalationLevel,
          model.disabledTill,
          model.lastRssSyncReleaseInfo ? JSON.stringify(model.lastRssSyncReleaseInfo) : null
        );

      return { ...model, id: Number(result.lastInsertRowid) };
    }

    this.conn()
      .prepare(
        'UPDATE "IndexerStatus" SET "ProviderId" = ?, "InitialFailure" = ?, "MostRecentFailure" = ?, "EscalationLevel" = ?, "DisabledTill" = ?, "LastRssSyncReleaseInfo" = ? WHERE "Id" = ?'
      )
      .run(
        model.providerId,
        model.initialFailure,
        model.mostRecentFailure,
        model.escalationLevel,
        model.disabledTill,
        model.lastRssSyncReleaseInfo ? JSON.stringify(model.lastRssSyncReleaseInfo) : null,
        model.id
      );

    return model;
  }

  /** Ported from ProviderStatusRepository.DeleteByProviderId(): Delete(c => c.ProviderId == providerId). */
  deleteByProviderId(providerId: number): void {
    this.conn().prepare('DELETE FROM "IndexerStatus" WHERE "ProviderId" = ?').run(providerId);
  }
}

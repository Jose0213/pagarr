import type { IDatabase } from "../db/database.js";
import { ProviderStatusRepository } from "../thingi-provider/status/ProviderStatusRepository.js";
import type { ImportListStatus } from "./ImportListStatus.js";

/**
 * Ported from NzbDrone.Core/ImportLists/ImportListStatusRepository.cs +
 * NzbDrone.Core/ThingiProvider/Status/ProviderStatusRepository.cs.
 *
 * `ImportListStatusRepository : ProviderStatusRepository<ImportListStatus>`
 * in C# -- an empty subclass adding no members of its own. Extends the REAL
 * `thingi-provider/status/ProviderStatusRepository.ts` (per this module's
 * task brief), same pattern `notifications/NotificationStatusRepository.ts`
 * established. Unlike that sibling, `ImportListStatus` DOES have one extra
 * column of its own (`LastInfoSync`, migration 0029) -- but since it's a
 * plain text column (not a JSON-embedded document, unlike Indexers'
 * `LastRssSyncReleaseInfo`), `BasicRepository`'s ordinary `ColumnMapping`
 * list handles it without needing the hand-rolled-SQL deviation
 * `indexers/IndexerStatusRepository.ts` had to take -- it's declared here as
 * just one more entry in the `columns` list passed to the base.
 */
export interface IImportListStatusRepository {
  all(): ImportListStatus[];
  find(id: number): ImportListStatus | undefined;
  findByProviderId(providerId: number): ImportListStatus | undefined;
  upsert(model: ImportListStatus): ImportListStatus;
  deleteByProviderId(providerId: number): void;
}

export class ImportListStatusRepository
  extends ProviderStatusRepository<ImportListStatus>
  implements IImportListStatusRepository
{
  constructor(database: IDatabase) {
    super(database, {
      tableName: "ImportListStatus",
      columns: [
        { prop: "providerId", column: "ProviderId" },
        { prop: "initialFailure", column: "InitialFailure" },
        { prop: "mostRecentFailure", column: "MostRecentFailure" },
        { prop: "escalationLevel", column: "EscalationLevel" },
        { prop: "disabledTill", column: "DisabledTill" },
        { prop: "lastInfoSync", column: "LastInfoSync" },
      ],
    });
  }
}

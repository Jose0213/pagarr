import type { IDatabase } from "../db/database.js";
import { ProviderStatusRepository } from "../thingi-provider/status/ProviderStatusRepository.js";
import type { NotificationStatus } from "./NotificationStatus.js";

/**
 * Ported from NzbDrone.Core/Notifications/NotificationStatusRepository.cs +
 * NzbDrone.Core/ThingiProvider/Status/ProviderStatusRepository.cs.
 *
 * `NotificationStatusRepository : ProviderStatusRepository<NotificationStatus>`
 * in C# -- an empty subclass adding no members, extending the REAL
 * `thingi-provider/status/ProviderStatusRepository.ts` for real (per this
 * module's task brief). That base itself builds on `BasicRepository<TModel>`
 * (see its own doc comment) and already implements `all`/`find`/
 * `findByProviderId`/`upsert`/`deleteByProviderId` -- this subclass only
 * supplies the table name + column mapping for the real `NotificationStatus`
 * table (migration 0037: Id/ProviderId/InitialFailure/MostRecentFailure/
 * EscalationLevel/DisabledTill), matching how a normal `BasicRepository`
 * consumer would.
 */
export interface INotificationStatusRepository {
  all(): NotificationStatus[];
  find(id: number): NotificationStatus | undefined;
  findByProviderId(providerId: number): NotificationStatus | undefined;
  upsert(model: NotificationStatus): NotificationStatus;
  deleteByProviderId(providerId: number): void;
}

export class NotificationStatusRepository
  extends ProviderStatusRepository<NotificationStatus>
  implements INotificationStatusRepository
{
  constructor(database: IDatabase) {
    super(database, {
      tableName: "NotificationStatus",
      columns: [
        { prop: "providerId", column: "ProviderId" },
        { prop: "initialFailure", column: "InitialFailure" },
        { prop: "mostRecentFailure", column: "MostRecentFailure" },
        { prop: "escalationLevel", column: "EscalationLevel" },
        { prop: "disabledTill", column: "DisabledTill" },
      ],
    });
  }
}

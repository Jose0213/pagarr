import type { IDatabase } from "../../db/database.js";
import type { IHousekeepingTask } from "../iHousekeepingTask.js";

/**
 * Ported from NzbDrone.Core/Housekeeping/Housekeepers/CleanupOrphanedNotificationStatus.cs.
 *
 * Deletes "NotificationStatus" rows whose "ProviderId" no longer matches
 * any "Notifications" row. Both tables already exist in this port's schema
 * (db/migrations/0037_add_notification_status.sql +
 * 0001_initial_setup.sql's "Notifications" table), even though the C#
 * `Notifications` module itself (a real repository/service/notifier layer)
 * hasn't been ported yet (PORT_PLAN.md: "Notifications (176 files)" is
 * future Wave 2 work) -- same as the real C# housekeeper, this task talks
 * to both tables directly via raw SQL, not through a
 * `NotificationStatusRepository`, so no forward-ref is needed here.
 */
export class CleanupOrphanedNotificationStatus implements IHousekeepingTask {
  constructor(private readonly database: IDatabase) {}

  clean(): void {
    this.database
      .openConnection()
      .prepare(
        `DELETE FROM "NotificationStatus"
         WHERE "Id" IN (
           SELECT "NotificationStatus"."Id" FROM "NotificationStatus"
           LEFT OUTER JOIN "Notifications"
           ON "NotificationStatus"."ProviderId" = "Notifications"."Id"
           WHERE "Notifications"."Id" IS NULL)`
      )
      .run();
  }
}

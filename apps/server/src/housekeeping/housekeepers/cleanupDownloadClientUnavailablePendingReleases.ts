import type { IDatabase } from "../../db/database.js";
import { PendingReleaseReason } from "../../download-tracking/pending/pendingReleaseReason.js";
import type { IHousekeepingTask } from "../iHousekeepingTask.js";

const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * Ported from NzbDrone.Core/Housekeeping/Housekeepers/CleanupDownloadClientUnavailablePendingReleases.cs.
 *
 * Deletes "PendingReleases" rows older than two weeks whose "Reason" is
 * `DownloadClientUnavailable` or `Fallback` -- these are releases that got
 * stuck pending because no download client was available (or a fallback
 * path was taken) and never got picked back up.
 */
export class CleanupDownloadClientUnavailablePendingReleases implements IHousekeepingTask {
  constructor(private readonly database: IDatabase) {}

  clean(): void {
    const twoWeeksAgo = new Date(Date.now() - TWO_WEEKS_MS).toISOString();

    this.database
      .openConnection()
      .prepare(
        `DELETE FROM "PendingReleases"
         WHERE "Added" < ?
         AND "Reason" IN (?, ?)`
      )
      .run(
        twoWeeksAgo,
        PendingReleaseReason.DownloadClientUnavailable,
        PendingReleaseReason.Fallback
      );
  }
}

import {
  ProviderStatusServiceBase,
  type ProviderStatusServiceClock,
} from "../thingi-provider/status/ProviderStatusServiceBase.js";
import type { IImportListStatusRepository } from "./ImportListStatusRepository.js";
import { createImportListStatus, type ImportListStatus } from "./ImportListStatus.js";

/**
 * Ported from NzbDrone.Core/ImportLists/ImportListStatusService.cs +
 * NzbDrone.Core/ThingiProvider/Status/ProviderStatusServiceBase.cs.
 *
 * `ImportListStatusService : ProviderStatusServiceBase<IImportList,
 * ImportListStatus>` in C#, whose constructor does NOT override any of the
 * base's default backoff tuning (unlike `NotificationStatusService`/
 * `DownloadClientStatusService`, both of which override
 * `MinimumTimeSinceInitialFailure`/`MaximumEscalationLevel` -- see
 * `notifications/NotificationStatusService.ts`'s doc comment). This matches
 * `IndexerStatusService`, which also leaves all three base defaults as-is.
 * Built on the REAL `thingi-provider/status/ProviderStatusServiceBase.ts`
 * generic base (per this module's task brief).
 *
 * Adds two ImportLists-specific members on top of the base surface:
 * `getLastSyncListInfo`/`updateListSyncStatus`, ported from
 * `GetLastSyncListInfo(int)`/`UpdateListSyncStatus(int)`.
 */
export interface IImportListStatusService {
  getBlockedProviders(): ImportListStatus[];
  recordSuccess(providerId: number): void;
  recordFailure(providerId: number, minimumBackOffMs?: number): void;
  recordConnectionFailure(providerId: number): void;
  getLastSyncListInfo(importListId: number): string | null;
  updateListSyncStatus(importListId: number): void;
}

export class ImportListStatusService
  extends ProviderStatusServiceBase<ImportListStatus>
  implements IImportListStatusService
{
  constructor(repository: IImportListStatusRepository, clock?: ProviderStatusServiceClock) {
    super(repository, clock);
  }

  /** Ported from ImportListStatusService.GetLastSyncListInfo(int importListId): GetProviderStatus(importListId).LastInfoSync. */
  getLastSyncListInfo(importListId: number): string | null {
    return this.getProviderStatus(importListId).lastInfoSync;
  }

  /**
   * Ported from ImportListStatusService.UpdateListSyncStatus(int
   * importListId): under `lock (_syncRoot)` in C# (no-op here, see
   * `ProviderStatusServiceBase.ts`'s doc comment on thread-safety), stamps
   * `LastInfoSync = DateTime.UtcNow` and upserts.
   */
  updateListSyncStatus(importListId: number): void {
    const status = this.getProviderStatus(importListId);
    status.lastInfoSync = new Date(this.clock.now()).toISOString();
    this.repository.upsert(status);
  }

  /** Override to guarantee a fully-shaped ImportListStatus (with lastInfoSync) rather than the base's generic ProviderStatusBase-shaped fallback. */
  protected override getProviderStatus(providerId: number): ImportListStatus {
    return this.repository.findByProviderId(providerId) ?? createImportListStatus({ providerId });
  }
}

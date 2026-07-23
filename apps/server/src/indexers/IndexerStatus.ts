import type { ModelBase } from "../db/model-base.js";
import type { ReleaseInfo } from "./releaseInfo.js";

/**
 * Ported from NzbDrone.Core/ThingiProvider/Status/ProviderStatusBase.cs +
 * NzbDrone.Core/Indexers/IndexerStatus.cs.
 *
 * FORWARD-REFERENCE NARROWING: `ProviderStatusBase` is the shared base for
 * every provider kind's status row (Indexers, DownloadClients,
 * ImportLists, Notifications, Metadata) in the not-yet-ported
 * `NzbDrone.Core.ThingiProvider` module. Since Indexers is the first
 * provider-kind module being ported, this file inlines the base's fields
 * directly onto `IndexerStatus` rather than modeling a generic
 * `ProviderStatusBase` here -- a later phase porting `ThingiProvider`
 * itself (when a second provider kind needs the same shape) is the right
 * place to extract a shared base and have this interface (and its
 * `IndexerStatuses` table shape, unchanged) extend it instead.
 */
export interface IndexerStatus extends ModelBase {
  providerId: number;
  initialFailure: string | null;
  mostRecentFailure: string | null;
  escalationLevel: number;
  disabledTill: string | null;
  lastRssSyncReleaseInfo: ReleaseInfo | null;
}

export function createIndexerStatus(overrides: Partial<IndexerStatus> = {}): IndexerStatus {
  return {
    id: 0,
    providerId: 0,
    initialFailure: null,
    mostRecentFailure: null,
    escalationLevel: 0,
    disabledTill: null,
    lastRssSyncReleaseInfo: null,
    ...overrides,
  };
}

/** Ported from ProviderStatusBase.IsDisabled(). */
export function isIndexerStatusDisabled(status: IndexerStatus): boolean {
  return status.disabledTill !== null && new Date(status.disabledTill).getTime() > Date.now();
}

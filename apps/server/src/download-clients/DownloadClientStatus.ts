import type { ModelBase } from "../db/model-base.js";

/**
 * Ported from NzbDrone.Core/ThingiProvider/Status/ProviderStatusBase.cs +
 * NzbDrone.Core/Download/DownloadClientStatus.cs (an empty subclass of
 * `ProviderStatusBase` in C# -- adds no fields of its own).
 *
 * FORWARD-REFERENCE NARROWING: same rationale as indexers/IndexerStatus.ts's
 * doc comment -- `ProviderStatusBase` is the not-yet-ported
 * `NzbDrone.Core.ThingiProvider` module's shared base for every provider
 * kind's status row. Indexers (the first provider-kind module ported)
 * inlined that base's fields directly rather than modeling a generic type;
 * Download is the *second* provider-kind module to need the identical shape
 * (`DownloadClientStatus` has no fields beyond `ProviderStatusBase`, exactly
 * like `IndexerStatus`), which is precisely the trigger IndexerFactory.ts's
 * own doc comment names for "a later phase porting ThingiProvider itself...
 * is the right place to extract a shared base". That extraction touches
 * `indexers/IndexerStatus.ts` (outside this worktree's allowed paths --
 * this module may only add files under `download-clients/`, per the task
 * brief), so it's deliberately deferred rather than done here; this file
 * duplicates the same inline shape instead. The `DownloadClientStatuses`
 * table (see migration 0001, `DownloadClientStatus` -- no `LastRssSyncReleaseInfo`
 * column, since that field is Indexers-specific RSS-sync bookkeeping with no
 * download-client equivalent) confirms the two are genuinely structurally
 * identical minus that one field.
 */
export interface DownloadClientStatus extends ModelBase {
  providerId: number;
  initialFailure: string | null;
  mostRecentFailure: string | null;
  escalationLevel: number;
  disabledTill: string | null;
}

export function createDownloadClientStatus(
  overrides: Partial<DownloadClientStatus> = {}
): DownloadClientStatus {
  return {
    id: 0,
    providerId: 0,
    initialFailure: null,
    mostRecentFailure: null,
    escalationLevel: 0,
    disabledTill: null,
    ...overrides,
  };
}

/** Ported from ProviderStatusBase.IsDisabled(). */
export function isDownloadClientStatusDisabled(status: DownloadClientStatus): boolean {
  return status.disabledTill !== null && new Date(status.disabledTill).getTime() > Date.now();
}

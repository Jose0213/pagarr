import type { ModelBase } from "../../db/model-base.js";

/**
 * Ported from NzbDrone.Core/ThingiProvider/Status/ProviderStatusBase.cs.
 *
 * The real shared base every provider-kind's own status row (IndexerStatus,
 * DownloadClientStatus, ImportListStatus, and -- once ported --
 * NotificationStatus) conceptually extends in C#. The two already-merged
 * siblings inlined this shape directly rather than extending a shared base
 * -- see `indexers/IndexerStatus.ts`'s doc comment ("FORWARD-REFERENCE
 * NARROWING... a later phase porting ThingiProvider itself... is the right
 * place to extract a shared base"). This is that later phase's extraction;
 * the siblings are NOT retrofitted to extend it (out of scope per this
 * task's brief).
 *
 * `lastRssSyncReleaseInfo` (Indexers-specific) and any other
 * provider-kind-specific extra column are intentionally NOT part of this
 * base -- C#'s `ProviderStatusBase` itself has no such field either; it's
 * added by the concrete `IndexerStatus : ProviderStatusBase` subclass only.
 * A concrete module extending this interface adds its own extra fields the
 * same way.
 */
export interface ProviderStatusBase extends ModelBase {
  providerId: number;
  initialFailure: string | null;
  mostRecentFailure: string | null;
  escalationLevel: number;
  disabledTill: string | null;
}

export function createProviderStatusBase(
  overrides: Partial<ProviderStatusBase> = {}
): ProviderStatusBase {
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
export function isProviderStatusDisabled(status: ProviderStatusBase): boolean {
  return status.disabledTill !== null && new Date(status.disabledTill).getTime() > Date.now();
}

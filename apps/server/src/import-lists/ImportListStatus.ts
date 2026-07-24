import type { ProviderStatusBase } from "../thingi-provider/status/ProviderStatusBase.js";
import {
  createProviderStatusBase,
  isProviderStatusDisabled,
} from "../thingi-provider/status/ProviderStatusBase.js";

/**
 * Ported from NzbDrone.Core/ImportLists/ImportListStatus.cs: `public class
 * ImportListStatus : ProviderStatusBase` -- extends the REAL
 * `thingi-provider/status/ProviderStatusBase.ts` (per this module's task
 * brief), adding one field of its own (`LastInfoSync`).
 *
 * Backing table: `ImportListStatus` (migration 0001, later altered by
 * migration 0029 which drops the original `LastSyncListInfo` column and adds
 * `LastInfoSync` in its place -- see that migration's doc comment on the C#
 * rename this mirrors).
 */
export interface ImportListStatus extends ProviderStatusBase {
  /** ISO-8601 timestamp string, or null. Ported from `DateTime? LastInfoSync`. */
  lastInfoSync: string | null;
}

export function createImportListStatus(
  overrides: Partial<ImportListStatus> = {}
): ImportListStatus {
  return {
    ...createProviderStatusBase(),
    lastInfoSync: null,
    ...overrides,
  };
}

/** Ported from ProviderStatusBase.IsDisabled() (inherited, not overridden). */
export const isImportListStatusDisabled = isProviderStatusDisabled;

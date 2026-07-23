import type { ProviderStatusBase } from "../thingi-provider/status/ProviderStatusBase.js";
import {
  createProviderStatusBase,
  isProviderStatusDisabled,
} from "../thingi-provider/status/ProviderStatusBase.js";

/**
 * Ported from NzbDrone.Core/Notifications/NotificationStatus.cs: `public
 * class NotificationStatus : ProviderStatusBase` -- an empty subclass
 * adding no fields of its own, extending the REAL
 * `thingi-provider/status/ProviderStatusBase.ts` (unlike
 * `download-clients/DownloadClientStatus.ts`, which had to duplicate that
 * base's shape inline since ThingiProvider didn't exist yet when it was
 * ported -- see that file's doc comment. Notifications is the intended real
 * consumer per this module's task brief).
 *
 * Backing table: `NotificationStatus` (migration 0037) -- columns exactly
 * match `ProviderStatusBase` (Id/ProviderId/InitialFailure/
 * MostRecentFailure/EscalationLevel/DisabledTill), confirming this really is
 * an empty subclass with no extra persisted fields.
 */
export type NotificationStatus = ProviderStatusBase;

export function createNotificationStatus(
  overrides: Partial<NotificationStatus> = {}
): NotificationStatus {
  return createProviderStatusBase(overrides);
}

/** Ported from ProviderStatusBase.IsDisabled() (inherited, not overridden). */
export const isNotificationStatusDisabled = isProviderStatusDisabled;

import type { IProviderConfig } from "../thingi-provider/IProviderConfig.js";
import {
  createProviderDefinition,
  type ProviderDefinition,
} from "../thingi-provider/ProviderDefinition.js";

/**
 * Ported from NzbDrone.Core/Notifications/NotificationDefinition.cs.
 *
 * `NotificationDefinition : ProviderDefinition` -- extends the REAL
 * `thingi-provider/ProviderDefinition.ts` (unlike `IndexerDefinition`/
 * `DownloadClientDefinition`, both of which had to inline
 * `ProviderDefinition`'s fields directly since that module didn't exist yet
 * when they were ported -- see e.g. `download-clients/DownloadClientDefinition.ts`'s
 * "FORWARD-REFERENCE NARROWING" doc comment). Per this module's task brief,
 * Notifications is the intended real consumer of that generic base.
 */
export interface NotificationDefinition<
  TProviderConfig extends IProviderConfig = IProviderConfig,
> extends ProviderDefinition<TProviderConfig> {
  onGrab: boolean;
  onReleaseImport: boolean;
  onUpgrade: boolean;
  onRename: boolean;
  onAuthorAdded: boolean;
  onAuthorDelete: boolean;
  onBookDelete: boolean;
  onBookFileDelete: boolean;
  onBookFileDeleteForUpgrade: boolean;
  onHealthIssue: boolean;
  onDownloadFailure: boolean;
  onImportFailure: boolean;
  onBookRetag: boolean;
  onApplicationUpdate: boolean;

  supportsOnGrab: boolean;
  supportsOnReleaseImport: boolean;
  supportsOnUpgrade: boolean;
  supportsOnRename: boolean;
  supportsOnAuthorAdded: boolean;
  supportsOnAuthorDelete: boolean;
  supportsOnBookDelete: boolean;
  supportsOnBookFileDelete: boolean;
  supportsOnBookFileDeleteForUpgrade: boolean;
  supportsOnHealthIssue: boolean;
  includeHealthWarnings: boolean;
  supportsOnDownloadFailure: boolean;
  supportsOnImportFailure: boolean;
  supportsOnBookRetag: boolean;
  supportsOnApplicationUpdate: boolean;
}

/**
 * Ported from `NotificationDefinition`'s implicit default field values (C#
 * auto-properties default to `false`) plus `ProviderDefinition`'s own
 * defaults (via `createProviderDefinition`).
 */
export function createNotificationDefinition<
  TProviderConfig extends IProviderConfig = IProviderConfig,
>(
  overrides: Partial<NotificationDefinition<TProviderConfig>> = {}
): NotificationDefinition<TProviderConfig> {
  return {
    ...createProviderDefinition<TProviderConfig>(),
    onGrab: false,
    onReleaseImport: false,
    onUpgrade: false,
    onRename: false,
    onAuthorAdded: false,
    onAuthorDelete: false,
    onBookDelete: false,
    onBookFileDelete: false,
    onBookFileDeleteForUpgrade: false,
    onHealthIssue: false,
    onDownloadFailure: false,
    onImportFailure: false,
    onBookRetag: false,
    onApplicationUpdate: false,
    supportsOnGrab: false,
    supportsOnReleaseImport: false,
    supportsOnUpgrade: false,
    supportsOnRename: false,
    supportsOnAuthorAdded: false,
    supportsOnAuthorDelete: false,
    supportsOnBookDelete: false,
    supportsOnBookFileDelete: false,
    supportsOnBookFileDeleteForUpgrade: false,
    supportsOnHealthIssue: false,
    includeHealthWarnings: false,
    supportsOnDownloadFailure: false,
    supportsOnImportFailure: false,
    supportsOnBookRetag: false,
    supportsOnApplicationUpdate: false,
    ...overrides,
  };
}

/**
 * Ported from `NotificationDefinition.Enable` (an overridden getter, NOT a
 * settable field -- see `ProviderDefinition.Enable`'s base `virtual bool`):
 * `OnGrab || OnReleaseImport || (OnReleaseImport && OnUpgrade) || OnRename
 * || OnAuthorAdded || OnAuthorDelete || OnBookDelete || OnBookFileDelete ||
 * OnBookFileDeleteForUpgrade || OnHealthIssue || OnDownloadFailure ||
 * OnImportFailure || OnBookRetag || OnApplicationUpdate`.
 *
 * FAITHFULLY PRESERVED QUIRK: `OnReleaseImport && OnUpgrade` is redundant
 * with the bare `OnReleaseImport` immediately before it in the `||` chain
 * (if `OnReleaseImport` is true the whole expression is already true
 * regardless of `OnUpgrade`; if it's false the `&&` term is false too) --
 * dead sub-expression in the real C# source, kept exactly as-is rather than
 * simplified away, per this port's "preserve bugs/quirks faithfully"
 * instruction.
 *
 * This port's `ProviderDefinition.enable` is a plain settable boolean field
 * (not a virtual getter -- TS interfaces have no override mechanism for
 * that), so this function is the substitute a caller invokes to compute the
 * derived value and assign it to `definition.enable` explicitly wherever
 * C# would have read the computed `.Enable` property. `NotificationFactory`
 * (this module's `Active()` override) calls this instead of reading
 * `definition.enable` directly.
 */
export function computeNotificationDefinitionEnable(
  definition: Pick<
    NotificationDefinition,
    | "onGrab"
    | "onReleaseImport"
    | "onUpgrade"
    | "onRename"
    | "onAuthorAdded"
    | "onAuthorDelete"
    | "onBookDelete"
    | "onBookFileDelete"
    | "onBookFileDeleteForUpgrade"
    | "onHealthIssue"
    | "onDownloadFailure"
    | "onImportFailure"
    | "onBookRetag"
    | "onApplicationUpdate"
  >
): boolean {
  return (
    definition.onGrab ||
    definition.onReleaseImport ||
    (definition.onReleaseImport && definition.onUpgrade) ||
    definition.onRename ||
    definition.onAuthorAdded ||
    definition.onAuthorDelete ||
    definition.onBookDelete ||
    definition.onBookFileDelete ||
    definition.onBookFileDeleteForUpgrade ||
    definition.onHealthIssue ||
    definition.onDownloadFailure ||
    definition.onImportFailure ||
    definition.onBookRetag ||
    definition.onApplicationUpdate
  );
}

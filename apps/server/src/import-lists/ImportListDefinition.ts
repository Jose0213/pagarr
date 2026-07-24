import type { IImportListSettings } from "./IImportListSettings.js";
import {
  createProviderDefinition,
  type ProviderDefinition,
} from "../thingi-provider/ProviderDefinition.js";
import type { ImportListStatus } from "./ImportListStatus.js";
import { ImportListType } from "./ImportListType.js";

/**
 * Ported from NzbDrone.Core/ImportLists/ImportListDefinition.cs's
 * `ImportListMonitorType` enum.
 */
export enum ImportListMonitorType {
  None = "None",
  SpecificBook = "SpecificBook",
  EntireAuthor = "EntireAuthor",
}

/**
 * Ported from Books/Model/NewItemMonitorTypes.cs -- reused here (rather than
 * re-declared) since `books/models.ts` already ports this exact enum for
 * `Author.MonitorNewItems`, and `ImportListDefinition.MonitorNewItems` is
 * the same C# enum type reused on a different owning class.
 */
export { NewItemMonitorTypes } from "../books/models.js";

/**
 * Ported from NzbDrone.Core/ImportLists/ImportListDefinition.cs.
 *
 * `ImportListDefinition : ProviderDefinition` -- extends the REAL
 * `thingi-provider/ProviderDefinition.ts` (per this module's task brief,
 * same pattern `NotificationDefinition` established).
 */
export interface ImportListDefinition<
  TProviderConfig extends IImportListSettings = IImportListSettings,
> extends ProviderDefinition<TProviderConfig> {
  enableAutomaticAdd: boolean;
  shouldMonitor: ImportListMonitorType;
  shouldMonitorExisting: boolean;
  shouldSearch: boolean;
  /** NewItemMonitorTypes ordinal -- see the re-export above. */
  monitorNewItems: number;
  profileId: number;
  metadataProfileId: number;
  rootFolderPath: string;

  status?: ImportListStatus;
  listType: ImportListType;
  /** Milliseconds. Ported from `TimeSpan MinRefreshInterval`. */
  minRefreshIntervalMs: number;
}

/**
 * Ported from `ImportListDefinition`'s implicit default field values plus
 * `ProviderDefinition`'s own defaults (via `createProviderDefinition`).
 */
export function createImportListDefinition<
  TProviderConfig extends IImportListSettings = IImportListSettings,
>(
  overrides: Partial<ImportListDefinition<TProviderConfig>> = {}
): ImportListDefinition<TProviderConfig> {
  return {
    ...createProviderDefinition<TProviderConfig>(),
    enableAutomaticAdd: false,
    shouldMonitor: ImportListMonitorType.None,
    shouldMonitorExisting: false,
    shouldSearch: false,
    monitorNewItems: 0,
    profileId: 0,
    metadataProfileId: 0,
    rootFolderPath: "",
    listType: ImportListType.Program,
    minRefreshIntervalMs: 0,
    ...overrides,
  };
}

/**
 * Ported from `ImportListDefinition.Enable` (an overridden getter, NOT a
 * settable field -- see `NotificationDefinition.ts`'s
 * `computeNotificationDefinitionEnable` doc comment for the identical
 * pattern): `override bool Enable => EnableAutomaticAdd;`. This port's
 * `ProviderDefinition.enable` is a plain settable field; a caller recomputes
 * this and assigns it explicitly wherever C# would have read the virtual
 * `.Enable` property, exactly like NotificationFactory does for its own
 * override.
 */
export function computeImportListDefinitionEnable(
  definition: Pick<ImportListDefinition, "enableAutomaticAdd">
): boolean {
  return definition.enableAutomaticAdd;
}

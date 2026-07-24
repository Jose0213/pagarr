import type { IProvider } from "../thingi-provider/IProvider.js";
import type { ImportListItemInfo } from "../parser/model/importListItemInfo.js";
import type { IImportListSettings } from "./IImportListSettings.js";
import type { ImportListType } from "./ImportListType.js";

/**
 * Ported from NzbDrone.Core/ImportLists/IImportList.cs.
 * `IImportList : IProvider` -- extends the REAL `thingi-provider/IProvider.ts`
 * (per this module's task brief).
 */
export interface IImportList<
  TSettings extends IImportListSettings = IImportListSettings,
> extends IProvider<TSettings> {
  readonly listType: ImportListType;
  /** Milliseconds. Ported from `TimeSpan MinRefreshInterval`. */
  readonly minRefreshIntervalMs: number;
  fetch(): Promise<ImportListItemInfo[]>;
}

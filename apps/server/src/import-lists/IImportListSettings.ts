import type { IProviderConfig } from "../thingi-provider/IProviderConfig.js";

/**
 * Ported from NzbDrone.Core/ImportLists/IImportListSettings.cs.
 * Extends the REAL `thingi-provider/IProviderConfig.ts` (per this module's
 * task brief -- ImportLists is a real consumer of ThingiProvider, same as
 * Notifications).
 */
export interface IImportListSettings extends IProviderConfig {
  baseUrl: string;
}

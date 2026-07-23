import { OsPath } from "./OsPath.js";

/** Ported from NzbDrone.Core/Download/DownloadClientInfo.cs. */
export interface DownloadClientInfo {
  isLocalhost: boolean;
  removesCompletedDownloads: boolean;
  outputRootFolders: OsPath[];
}

/** Ported from `DownloadClientInfo`'s ctor (`OutputRootFolders = new List<OsPath>()`). */
export function createDownloadClientInfo(
  overrides: Partial<DownloadClientInfo> = {}
): DownloadClientInfo {
  return {
    isLocalhost: false,
    removesCompletedDownloads: false,
    outputRootFolders: [],
    ...overrides,
  };
}

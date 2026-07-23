import type { DownloadProtocol } from "../indexers/DownloadProtocol.js";
import type { DownloadItemStatus } from "./DownloadItemStatus.js";
import { OsPath } from "./OsPath.js";

/**
 * Ported from NzbDrone.Core/Download/DownloadClientItem.cs's
 * `DownloadClientItemClientInfo` class.
 */
export interface DownloadClientItemClientInfo {
  protocol: DownloadProtocol;
  type: string;
  id: number;
  name: string;
  hasPostImportCategory: boolean;
}

/**
 * Minimal shape `DownloadClientItemClientInfo.FromDownloadClient<TSettings>`
 * needs from a `DownloadClientBase<TSettings>` instance: its `protocol`/
 * `name` getters plus the live `definition` (C#'s `Definition.Id`/
 * `Definition.Name`).
 */
export interface DownloadClientLike {
  readonly protocol: DownloadProtocol;
  readonly name: string;
  definition: { id: number; name: string };
}

/** Ported from `DownloadClientItemClientInfo.FromDownloadClient<TSettings>`. */
export function downloadClientItemClientInfoFromDownloadClient(
  downloadClient: DownloadClientLike,
  hasPostImportCategory: boolean
): DownloadClientItemClientInfo {
  return {
    protocol: downloadClient.protocol,
    type: downloadClient.name,
    id: downloadClient.definition.id,
    name: downloadClient.definition.name,
    hasPostImportCategory,
  };
}

/**
 * Ported from NzbDrone.Core/Download/DownloadClientItem.cs.
 *
 * C#'s `Clone()` is `MemberwiseClone()` (shallow copy) -- ported as
 * `cloneDownloadClientItem()` doing a shallow spread, matching that same
 * shallow-copy semantics (nested objects like `downloadClientInfo`/
 * `outputPath` are shared by reference with the original, exactly as
 * `MemberwiseClone` would share them).
 */
export interface DownloadClientItem {
  downloadClientInfo: DownloadClientItemClientInfo | null;
  downloadId: string;
  category: string | null;
  title: string;

  totalSize: number;
  remainingSize: number;
  /** Milliseconds, matching C#'s `TimeSpan? RemainingTime`. */
  remainingTime: number | null;
  seedRatio: number | null;
  outputPath: OsPath;
  message: string | null;
  status: DownloadItemStatus;
  isEncrypted: boolean;
  canMoveFiles: boolean;
  canBeRemoved: boolean;
  removed: boolean;
}

/** Ported from `DownloadClientItem`'s implicit default field values (C# defaults: 0/false/null). */
export function createDownloadClientItem(
  overrides: Partial<DownloadClientItem> = {}
): DownloadClientItem {
  return {
    downloadClientInfo: null,
    downloadId: "",
    category: null,
    title: "",
    totalSize: 0,
    remainingSize: 0,
    remainingTime: null,
    seedRatio: null,
    outputPath: OsPath.empty(),
    message: null,
    status: 0,
    isEncrypted: false,
    canMoveFiles: false,
    canBeRemoved: false,
    removed: false,
    ...overrides,
  };
}

/** Ported from `DownloadClientItem.Clone()` (MemberwiseClone -- shallow copy). */
export function cloneDownloadClientItem(item: DownloadClientItem): DownloadClientItem {
  return { ...item };
}

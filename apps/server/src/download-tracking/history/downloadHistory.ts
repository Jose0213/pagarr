import type { ModelBase } from "../../db/model-base.js";
import type { DownloadProtocol } from "../../indexers/DownloadProtocol.js";
import type { ReleaseInfo } from "../../parser/model/releaseInfo.js";

/** Ported from NzbDrone.Core/Download/History/DownloadHistory.cs's `DownloadHistoryEventType` enum. */
export enum DownloadHistoryEventType {
  DownloadGrabbed = 1,
  DownloadImported = 2,
  DownloadFailed = 3,
  DownloadIgnored = 4,
  FileImported = 5,
  DownloadImportIncomplete = 6,
}

/**
 * Ported from NzbDrone.Core/Download/History/DownloadHistory.cs. Backing
 * table: DownloadHistory (see db/migrations/0020_add_download_history.sql).
 *
 * C#'s `Protocol`/`IndexerId`/`DownloadClientId` are non-nullable value
 * types (`DownloadProtocol`/`int`) at the model level but the DB columns
 * are nullable (see the migration's `"Protocol" INTEGER NULL`, `"IndexerId"
 * INTEGER NULL`, `"DownloadClientId" INTEGER NULL`) -- ported as
 * `| null` here to match the actual column nullability faithfully, same
 * as this port's established convention elsewhere for C#/DB nullability
 * mismatches.
 */
export interface DownloadHistory extends ModelBase {
  eventType: DownloadHistoryEventType;
  authorId: number;
  downloadId: string;
  sourceTitle: string;
  /** ISO 8601 string. */
  date: string;
  protocol: DownloadProtocol | null;
  indexerId: number | null;
  downloadClientId: number | null;
  release: ReleaseInfo | null;
  data: Record<string, string>;
}

/** Ported from `DownloadHistory()`'s constructor: `Data` defaults to an empty dictionary, not null. */
export function newDownloadHistory(overrides: Partial<DownloadHistory> = {}): DownloadHistory {
  return {
    id: 0,
    eventType: DownloadHistoryEventType.DownloadGrabbed,
    authorId: 0,
    downloadId: "",
    sourceTitle: "",
    date: new Date(0).toISOString(),
    protocol: null,
    indexerId: null,
    downloadClientId: null,
    release: null,
    data: {},
    ...overrides,
  };
}

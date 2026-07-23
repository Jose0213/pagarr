import type { ModelBase } from "../db/model-base.js";
import type { Author } from "../books/models.js";
import { DownloadProtocol } from "../indexers/DownloadProtocol.js";
import { IndexerFlags } from "../indexers/releaseInfo.js";
import type { QualityModel } from "../qualities/qualityModel.js";

export { DownloadProtocol, IndexerFlags };

/**
 * Ported from NzbDrone.Core/Blocklisting/Blocklist.cs. Backing table:
 * Blocklist (originally "Blacklist" -- renamed by migration 0014; see
 * db/migrations/0001_initial_setup.sql + 0014_rename_blacklist_to_blocklist.sql
 * + 0040_add_indexer_flags.sql for the IndexerFlags column added later).
 *
 * `Author` is C#'s `LazyLoaded<Author>`-shaped navigation property here
 * ported as a plain optional field per this port's established LazyLoaded
 * convention (see `books/models.ts`'s header comment) -- populated by
 * callers that need it (e.g. a future API layer), not auto-fetched by the
 * repository's basic CRUD methods.
 */
export interface Blocklist extends ModelBase {
  authorId: number;
  author?: Author;
  bookIds: number[];
  sourceTitle: string;
  quality: QualityModel;
  /** ISO-8601 timestamp string (C# `DateTime`). */
  date: string;
  /** ISO-8601 timestamp string (C# `DateTime?`), null if unset. */
  publishedDate: string | null;
  size: number | null;
  protocol: DownloadProtocol;
  indexer: string | null;
  indexerFlags: IndexerFlags;
  message: string | null;
  torrentInfoHash: string | null;
}

/** Ported from `Blocklist`'s implicit default field values (C# auto-properties on a freshly `new`'d instance). */
export function newBlocklist(overrides: Partial<Blocklist> = {}): Blocklist {
  return {
    id: 0,
    authorId: 0,
    bookIds: [],
    sourceTitle: "",
    quality: undefined as unknown as QualityModel,
    date: new Date(0).toISOString(),
    publishedDate: null,
    size: null,
    protocol: DownloadProtocol.Unknown,
    indexer: null,
    indexerFlags: 0,
    message: null,
    torrentInfoHash: null,
    ...overrides,
  };
}

import type { Language } from "../languages/language.js";

/**
 * Ported from NzbDrone.Core/Parser/Model/ReleaseInfo.cs's `IndexerFlags`
 * [Flags] enum. TS has no native flags-enum type; a plain bitmask object of
 * numeric constants is the standard port shape used elsewhere in this repo
 * for C# [Flags] enums.
 */
export const IndexerFlags = {
  Freeleech: 1,
  Halfleech: 2,
  DoubleUpload: 4,
  Internal: 8,
  Scene: 16,
  Freeleech75: 32,
  Freeleech25: 64,
} as const;
export type IndexerFlags = number;

/**
 * Ported from NzbDrone.Core/Parser/Model/ReleaseInfo.cs.
 *
 * FORWARD-REFERENCE NARROWING: the real `ReleaseInfo` lives in the
 * not-yet-ported `NzbDrone.Core.Parser.Model` namespace and is referenced
 * throughout DecisionEngine/Download/MediaFiles (later phases). This port
 * defines the minimal shape the Indexers module itself produces and
 * consumes (RssParser/TorznabRssParser/NewznabRssParser write these fields;
 * HttpIndexerBase.CleanupReleases reads Guid/IndexerId/Indexer/Protocol/
 * IndexerPriority). `PendingReleaseReason` ([JsonIgnore], used by the
 * not-yet-ported Download.Pending module) is intentionally omitted --
 * nothing in this module's scope reads or writes it; a later phase can add
 * it back when PendingRelease is ported, the same way this module's own
 * omissions are documented here rather than silently dropped.
 *
 * `age`/`ageHours`/`ageMinutes` are computed getters in C# (derived from
 * `PublishDate`); ported here as functions rather than object getters so
 * the type stays a plain, easily-constructed/compared data shape (matching
 * this repo's general model-as-interface convention, e.g. `Language`,
 * `Author`).
 */
export interface ReleaseInfo {
  guid: string;
  title: string;
  size: number;
  downloadUrl: string;
  infoUrl: string | null;
  commentUrl: string | null;
  indexerId: number;
  indexer: string | null;
  author: string | null;
  book: string | null;
  indexerPriority: number;
  downloadProtocol: number;
  /** ISO-8601 UTC timestamp string (mirrors C#'s DateTime PublishDate). */
  publishDate: string;

  origin?: string | null;
  source?: string | null;
  container?: string | null;
  codec?: string | null;
  categories: number[];

  languages: Language[];

  indexerFlags: IndexerFlags;
}

/** Ported from ReleaseInfo's default ctor (Languages = new List<Language>()). */
export function createReleaseInfo(overrides: Partial<ReleaseInfo> = {}): ReleaseInfo {
  return {
    guid: "",
    title: "",
    size: 0,
    downloadUrl: "",
    infoUrl: null,
    commentUrl: null,
    indexerId: 0,
    indexer: null,
    author: null,
    book: null,
    indexerPriority: 0,
    downloadProtocol: 0,
    publishDate: new Date(0).toISOString(),
    categories: [],
    languages: [],
    indexerFlags: 0,
    ...overrides,
  };
}

/** Ported from ReleaseInfo.Age (get-only). */
export function releaseAge(release: ReleaseInfo): number {
  const diffMs = Date.now() - new Date(release.publishDate).getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

/** Ported from ReleaseInfo.AgeHours (get-only). */
export function releaseAgeHours(release: ReleaseInfo): number {
  const diffMs = Date.now() - new Date(release.publishDate).getTime();
  return diffMs / (1000 * 60 * 60);
}

/** Ported from ReleaseInfo.AgeMinutes (get-only). */
export function releaseAgeMinutes(release: ReleaseInfo): number {
  const diffMs = Date.now() - new Date(release.publishDate).getTime();
  return diffMs / (1000 * 60);
}

/**
 * Ported from NzbDrone.Core/Parser/Model/TorrentInfo.cs. A `ReleaseInfo`
 * with the torrent-specific fields TorrentRssParser/TorznabRssParser
 * populate. C#'s `TorrentInfo : ReleaseInfo` subclass + `as TorrentInfo`
 * downcasts become a discriminated-by-shape extension here (every field
 * optional-free since TorrentRssParser always sets them, matching
 * `CreateNewReleaseInfo()` always returning a fresh `TorrentInfo`).
 */
export interface TorrentInfo extends ReleaseInfo {
  magnetUrl: string | null;
  infoHash: string | null;
  seeders: number | null;
  peers: number | null;
}

export function createTorrentInfo(overrides: Partial<TorrentInfo> = {}): TorrentInfo {
  return {
    ...createReleaseInfo(overrides),
    magnetUrl: null,
    infoHash: null,
    seeders: null,
    peers: null,
    ...overrides,
  };
}

/** Ported from TorrentInfo.GetSeeders(ReleaseInfo release): `as TorrentInfo` downcast-or-null. */
export function torrentInfoGetSeeders(release: ReleaseInfo): number | null {
  return isTorrentInfo(release) ? release.seeders : null;
}

/** Ported from TorrentInfo.GetPeers(ReleaseInfo release): `as TorrentInfo` downcast-or-null. */
export function torrentInfoGetPeers(release: ReleaseInfo): number | null {
  return isTorrentInfo(release) ? release.peers : null;
}

export function isTorrentInfo(release: ReleaseInfo): release is TorrentInfo {
  return "seeders" in release && "peers" in release;
}

import { DownloadProtocol } from "../../../indexers/DownloadProtocol.js";
import {
  createReleaseInfo,
  createTorrentInfo,
  releaseAge,
  releaseAgeHours,
  releaseAgeMinutes,
  isTorrentInfo as isRealTorrentInfo,
  type ReleaseInfo,
  type TorrentInfo,
} from "../../../indexers/releaseInfo.js";
import type { CustomFormat } from "../../../profiles/customFormat.js";
import type { QualityModel } from "../../../qualities/qualityModel.js";
import { type DownloadDecision } from "../../../decision-engine/index.js";
import type { RestResource } from "../../rest/RestResource.js";
import {
  customFormatToResource,
  type CustomFormatResource,
} from "../CustomFormats/CustomFormatResource.js";

/**
 * `DownloadDecision.remoteBook.release` is statically typed via
 * decision-engine's own local, narrower `ReleaseInfo`/`TorrentInfo`
 * forward-ref copies (decision-engine/remoteBook.ts -- documented there as
 * "narrowed to the fields DecisionEngine's real C# source actually
 * reads/writes", missing `magnetUrl`/`indexerFlags` since no DecisionEngine
 * specification reads those two). `ReleaseResourceMapper.ToResource`'s real
 * C# source DOES read them (`torrentInfo.MagnetUrl`/`torrentInfo.IndexerFlags`)
 * -- a real `IIndexer.fetch()` result is always the REAL, richer
 * `indexers/releaseInfo.ts` `ReleaseInfo`/`TorrentInfo` (that module's own
 * real ported type, not a forward-reference) flowing through
 * `DownloadDecisionMaker`/`ReleaseSearchService` untouched (neither
 * transforms `.release` into a different, narrower object -- they only
 * ever read the few fields their own logic needs). This cast documents that
 * fact instead of silently dropping `magnetUrl`/`indexerFlags` from every
 * mapped `ReleaseResource`.
 */
function realReleaseInfo(release: unknown): ReleaseInfo {
  return release as ReleaseInfo;
}

/**
 * `CustomFormats = remoteBook.CustomFormats.ToResource(false)` in the real
 * C# `ReleaseResourceMapper.ToResource` -- the real
 * `CustomFormats/CustomFormatResource.ts`'s `customFormatToResource(model,
 * false)` (only `id`/`name` populated) called here directly. Repointed
 * during merge reconciliation from this worktree's original narrow local
 * `CustomFormatResource` forward-ref stand-in (`{id, name}`, declared
 * before the CustomFormats API group existed in this repo) -- same repoint
 * already applied to `resources/shared/embeddedResources.ts`'s identical
 * stand-in. This worktree's own narrower `profiles/customFormat.ts`
 * `CustomFormat` (only `id`/`name`) still satisfies `customFormatToResource`'s
 * `includeDetails: false` overload, which only reads those two fields.
 */
function releaseCustomFormatToResource(format: CustomFormat): CustomFormatResource {
  return customFormatToResource(format, false);
}

/**
 * Ported from Readarr.Api.V1/Indexers/ReleaseResource.cs.
 *
 * `AuthorId`/`BookId`/`DownloadClientId`/`DownloadClient` are
 * `[JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]` in the
 * real C# source -- i.e. omitted from JSON when they're at their type's
 * default value (`0`/`null`), same "omit when default" behavior as
 * `RestResource.Id` (see rest/RestResource.ts's `stripDefaultId`). Ported
 * here as optional fields (`number | undefined`/`string | undefined`)
 * rather than plumbing a second `stripDefaultId`-style helper through --
 * `releaseResourceToWire()` below only sets them when non-default, so
 * `JSON.stringify`/Express's `res.json()` naturally omits an `undefined`
 * property the same way `WhenWritingDefault` omits a C# default value.
 */
export interface ReleaseResource extends RestResource {
  guid: string;
  quality: QualityModel;
  qualityWeight: number;
  age: number;
  ageHours: number;
  ageMinutes: number;
  size: number;
  indexerId: number;
  indexer: string | null;
  releaseGroup: string | null;
  subGroup: string | null;
  releaseHash: string | undefined;
  title: string;
  discography: boolean;
  sceneSource: boolean;
  airDate?: string;
  authorName: string | null;
  bookTitle: string | string[] | null | undefined;
  approved: boolean;
  temporarilyRejected: boolean;
  rejected: boolean;
  rejections: string[];
  publishDate: string;
  commentUrl: string | null;
  downloadUrl: string;
  infoUrl: string | null;
  downloadAllowed: boolean;
  releaseWeight: number;
  customFormats: CustomFormatResource[];
  customFormatScore: number;

  magnetUrl: string | null;
  infoHash: string | null;
  seeders: number | null;
  leechers: number | null;
  protocol: DownloadProtocol;
  indexerFlags: number;

  // Sent when queuing an unknown release -- see this interface's doc
  // comment re: JsonIgnore(WhenWritingDefault).
  authorId?: number;
  bookId?: number;
  downloadClientId?: number;
  downloadClient?: string;
}

/**
 * Ported from `ReleaseResourceMapper.ToResource(this DownloadDecision
 * model)`. Reads `model.remoteBook.release`/`.parsedBookInfo`/`.remoteBook`
 * itself, downcasts to `TorrentInfo` for the torrent-only fields (matching
 * the real `(model.RemoteBook.Release as TorrentInfo) ?? new TorrentInfo()`
 * fallback -- `isTorrentInfo()`/an empty `TorrentInfo`-shaped object stands
 * in for the C# `as` downcast-or-default).
 *
 * `id` is left at `0` -- `ReleaseResource` (unlike `IndexerFlagResource`)
 * uses the DEFAULT `RestResource.Id` `[JsonIgnore(WhenWritingDefault)]`
 * behavior (no override), so `id: 0` here is correct and gets stripped by
 * `stripDefaultId()` at the route layer, matching the real source (which
 * never sets `Id` on a `ReleaseResource` at all -- releases are identified
 * by `Guid`, not a REST `Id`).
 */
export function releaseResourceFromDecision(decision: DownloadDecision): ReleaseResource {
  const remoteBook = decision.remoteBook;
  const releaseInfo = realReleaseInfo(remoteBook.release);
  const parsedBookInfo = remoteBook.parsedBookInfo;
  const torrentInfo = isRealTorrentInfo(releaseInfo) ? releaseInfo : createTorrentInfo();

  const seeders = torrentInfo.seeders ?? null;
  const peers = torrentInfo.peers ?? null;
  const leechers = peers !== null && seeders !== null ? peers - seeders : null;

  return {
    id: 0,
    guid: releaseInfo.guid,
    quality: parsedBookInfo.quality,
    qualityWeight: 0,
    age: releaseAge(releaseInfo),
    ageHours: releaseAgeHours(releaseInfo),
    ageMinutes: releaseAgeMinutes(releaseInfo),
    size: releaseInfo.size,
    indexerId: releaseInfo.indexerId,
    indexer: releaseInfo.indexer,
    releaseGroup: parsedBookInfo.releaseGroup ?? null,
    subGroup: null,
    releaseHash: parsedBookInfo.releaseHash,
    title: releaseInfo.title,
    authorName: parsedBookInfo.authorName,
    bookTitle: parsedBookInfo.bookTitle,
    discography: parsedBookInfo.discography,
    sceneSource: false,
    approved: decision.approved,
    temporarilyRejected: decision.temporarilyRejected,
    rejected: decision.rejected,
    rejections: decision.rejections.map((r) => r.reason),
    publishDate: releaseInfo.publishDate,
    commentUrl: releaseInfo.commentUrl ?? null,
    downloadUrl: releaseInfo.downloadUrl,
    infoUrl: releaseInfo.infoUrl ?? null,
    downloadAllowed: remoteBook.downloadAllowed,

    customFormatScore: remoteBook.customFormatScore,
    customFormats: remoteBook.customFormats.map(releaseCustomFormatToResource),

    magnetUrl: torrentInfo.magnetUrl ?? null,
    infoHash: torrentInfo.infoHash ?? null,
    seeders,
    leechers,
    protocol: releaseInfo.downloadProtocol as DownloadProtocol,
    indexerFlags: releaseInfo.indexerFlags ?? 0,

    releaseWeight: 0,
  };
}

/**
 * Ported from `ReleaseResourceMapper.ToModel(this ReleaseResource resource)`.
 * Builds a `TorrentInfo` when `Protocol == Torrent`, else a bare
 * `ReleaseInfo` -- matching the real conditional-construction exactly.
 */
export function releaseResourceToModel(resource: ReleaseResource): ReleaseInfo {
  const base = createReleaseInfo({
    guid: resource.guid,
    title: resource.title,
    size: resource.size,
    downloadUrl: resource.downloadUrl,
    infoUrl: resource.infoUrl,
    commentUrl: resource.commentUrl,
    indexerId: resource.indexerId,
    indexer: resource.indexer,
    downloadProtocol: resource.protocol,
    publishDate: new Date(resource.publishDate).toISOString(),
  });

  if (resource.protocol === DownloadProtocol.Torrent) {
    const peers =
      resource.seeders !== null && resource.leechers !== null
        ? resource.seeders + resource.leechers
        : null;

    const torrentInfo: TorrentInfo = createTorrentInfo({
      ...base,
      magnetUrl: resource.magnetUrl,
      seeders: resource.seeders,
      peers,
      infoHash: resource.infoHash,
    });

    return torrentInfo;
  }

  return base;
}

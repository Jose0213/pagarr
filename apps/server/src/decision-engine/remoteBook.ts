import type { Author, Book } from "../books/models.js";
import { DownloadProtocol } from "../indexers/DownloadProtocol.js";
import type { CustomFormat } from "../profiles/customFormat.js";
import type { QualityProfile } from "../profiles/qualities/qualityProfile.js";
import type { QualityModel } from "../qualities/qualityModel.js";

export { DownloadProtocol };

/**
 * Forward-references for the `Parser` and `Indexers` modules (Phase 2,
 * ported in parallel sibling worktrees not merged yet -- see this module's
 * top-level task instructions / PORT_PLAN.md). These define the minimal
 * shapes DecisionEngine's real C# source actually reads/writes on each
 * type, copied faithfully from the real C# classes below. When Parser and
 * Indexers land, these should be deleted in favor of importing the real
 * types -- field names/shapes were copied 1:1 so that swap should be
 * mechanical.
 *
 * - `RemoteBook` -- forward-ref for NzbDrone.Core/Parser/Model/RemoteBook.cs
 * - `ParsedBookInfo` -- forward-ref for NzbDrone.Core/Parser/Model/ParsedBookInfo.cs
 * - `ReleaseInfo` / `TorrentInfo` -- forward-ref for
 *   NzbDrone.Core/Parser/Model/ReleaseInfo.cs and
 *   NzbDrone.Core/Indexers/TorrentInfo.cs (TorrentInfo extends ReleaseInfo
 *   with torrent-specific fields; Specifications distinguish the two via
 *   `isTorrentInfo()` below, standing in for the C# `as TorrentInfo` /
 *   `is TorrentInfo` pattern)
 * - `DownloadProtocol` -- RECONCILED at Phase 2 merge review: this used to be
 *   a local forward-ref (a separate TS enum re-declared here, with a third
 *   copy in profiles/delay/delayProfile.ts) since Indexers -- the module that
 *   actually owns this type -- hadn't landed yet. Now that it has, this
 *   imports and re-exports the real `DownloadProtocol` from
 *   indexers/DownloadProtocol.ts. The three copies were structurally
 *   identical (Unknown=0, Usenet=1, Torrent=2) so this was never a runtime
 *   bug, but comparing values typed against different TS enum declarations
 *   is unsound by TS's own rules -- caught by @typescript-eslint/no-unsafe-enum-comparison
 *   in downloadDecisionComparer.ts once Prettier/ESLint were wired in.
 *   profiles/delay/delayProfile.ts's copy is a separate follow-up (interface,
 *   not enum, so it doesn't trip the same lint rule -- lower priority).
 * - `SearchCriteriaBase` / `AuthorSearchCriteria` / `BookSearchCriteria` --
 *   forward-refs for NzbDrone.Core/IndexerSearch/Definitions/*.cs
 * - `IndexerDefinition` / `ITorrentIndexerSettings` / `IIndexerSettings` --
 *   minimal forward-refs for the slice of NzbDrone.Core/Indexers/* that a
 *   few specifications (EarlyReleaseSpecification, TorrentSeedingSpecification,
 *   IndexerTagSpecification) read.
 */

/** Forward-ref for NzbDrone.Core/Parser/Model/ReleaseInfo.cs. */
export interface ReleaseInfo {
  guid: string;
  title: string;
  size: number;
  downloadUrl: string;
  infoUrl?: string;
  commentUrl?: string;
  indexerId: number;
  indexer: string;
  author?: string;
  book?: string;
  indexerPriority: number;
  downloadProtocol: DownloadProtocol;
  /** C# `DateTime PublishDate` -- ISO 8601 string here (see this repo's date convention elsewhere, e.g. Book.releaseDate). */
  publishDate: string;
  origin?: string;
  source?: string;
  container?: string | null;
  codec?: string;
  categories?: number[];

  /**
   * C# `Age`/`AgeHours`/`AgeMinutes` are computed get-only properties
   * (`DateTime.UtcNow.Subtract(PublishDate)...`), not stored fields. Ported
   * as functions (see ageDays/ageHours/ageMinutes below) rather than
   * interface members, since a plain data interface can't carry "now -
   * publishDate" computed behavior.
   */
}

/** Ported from `ReleaseInfo.Age` (days, integer via `.Days`). */
export function ageDays(release: ReleaseInfo): number {
  return Math.trunc((Date.now() - new Date(release.publishDate).getTime()) / (24 * 60 * 60 * 1000));
}

/** Ported from `ReleaseInfo.AgeHours` (`.TotalHours`, fractional). */
export function ageHours(release: ReleaseInfo): number {
  return (Date.now() - new Date(release.publishDate).getTime()) / (60 * 60 * 1000);
}

/** Ported from `ReleaseInfo.AgeMinutes` (`.TotalMinutes`, fractional). */
export function ageMinutes(release: ReleaseInfo): number {
  return (Date.now() - new Date(release.publishDate).getTime()) / (60 * 1000);
}

/**
 * Forward-ref for NzbDrone.Core/Indexers/TorrentInfo.cs (the slice
 * TorrentSeedingSpecification/AlreadyImportedSpecification/
 * DownloadDecisionComparer read): `Seeders`/`Peers`/`InfoHash` plus the
 * inherited ReleaseInfo fields.
 */
export interface TorrentInfo extends ReleaseInfo {
  seeders: number | null;
  peers: number | null;
  infoHash?: string | null;
}

/** Ported from `TorrentInfo.GetSeeders(ReleaseInfo release)`: returns Seeders only if `release` actually is a TorrentInfo. */
export function getSeeders(release: ReleaseInfo): number | null {
  return isTorrentInfo(release) ? release.seeders : null;
}

/** Ported from `TorrentInfo.GetPeers(ReleaseInfo release)`. */
export function getPeers(release: ReleaseInfo): number | null {
  return isTorrentInfo(release) ? release.peers : null;
}

/** Stands in for the C# `release is TorrentInfo torrentInfo` / `as TorrentInfo` pattern used throughout Specifications. */
export function isTorrentInfo(release: ReleaseInfo): release is TorrentInfo {
  return release.downloadProtocol === DownloadProtocol.Torrent && "seeders" in release;
}

/** Forward-ref for the slice of NzbDrone.Core/Indexers/IIndexerSettings.cs (EarlyReleaseSpecification). */
export interface IIndexerSettings {
  earlyReleaseLimit?: number | null;
}

/** Forward-ref for the slice of NzbDrone.Core/Indexers/ITorrentIndexerSettings.cs (TorrentSeedingSpecification). */
export interface ITorrentIndexerSettings {
  minimumSeeders: number;
}

/** Forward-ref for the slice of NzbDrone.Core/Indexers/IndexerDefinition.cs the DecisionEngine specs read. */
export interface IndexerDefinition {
  id: number;
  tags: Set<number>;
  settings?: (IIndexerSettings & Partial<ITorrentIndexerSettings>) | null;
}

/**
 * Forward-ref for NzbDrone.Core/Datastore/ModelNotFoundException.cs, thrown
 * by `IIndexerFactory.Get(id)` when the indexer no longer exists. Several
 * specs catch this specific exception type to treat "unknown indexer" as
 * "skip this check" rather than a hard failure -- ported as a real Error
 * subclass so `instanceof` works the same way `catch (ModelNotFoundException)`
 * does in C#.
 */
export class ModelNotFoundException extends Error {}

/** Minimal forward-ref for the lookup surface DecisionEngine specs need from IIndexerFactory (NzbDrone.Core/Indexers/IndexerFactory.cs). */
export interface IndexerFactoryLike {
  /** Throws ModelNotFoundException if no indexer with this id exists (matches IProviderFactory<TProvider, TProviderDefinition>.Get). */
  get(id: number): IndexerDefinition;
}

/**
 * `books/models.ts`'s `Author` (this port's real, merged Books module) keeps
 * C#'s `LazyLoaded<QualityProfile> QualityProfile` field as a caller-populated
 * plain optional property, per that file's own documented convention for
 * `LazyLoaded<T>` fields (see models.ts's header comment) -- but it doesn't
 * declare that optional field itself, since Books has no dependency on
 * Profiles. DecisionEngine's real C# source reads `subject.Author.
 * QualityProfile.Value` constantly (QualityAllowedByProfileSpecification,
 * CutoffSpecification, UpgradeDiskSpecification, ProtocolSpecification via
 * delay profile + tags, etc.), so this type augments `Author` locally with
 * the resolved `qualityProfile` a caller (DownloadDecisionMaker or a test)
 * is expected to have populated before building a `RemoteBook` -- mirroring
 * exactly how other already-ported call sites populate LazyLoaded fields
 * (e.g. `AuthorService.getAuthor()` callers fetching `.metadata` themselves).
 */
export interface AuthorWithQualityProfile extends Author {
  qualityProfile: QualityProfile;
}

/** Forward-ref for NzbDrone.Core/Parser/Model/ParsedBookInfo.cs. */
export interface ParsedBookInfo {
  bookTitle?: string | string[];
  authorName: string;
  quality: QualityModel;
  releaseDate?: string;
  discography: boolean;
  discographyStart?: number;
  discographyEnd?: number;
  releaseGroup?: string | null;
  releaseHash?: string;
  releaseVersion?: string;
  releaseTitle?: string;
}

/** Ported from NzbDrone.Core/Parser/Model/RemoteBook.cs's `ReleaseSourceType` enum. */
export enum ReleaseSourceType {
  Unknown = 0,
  Rss = 1,
  Search = 2,
  UserInvokedSearch = 3,
  InteractiveSearch = 4,
  ReleasePush = 5,
}

/**
 * Forward-ref for NzbDrone.Core/Parser/Model/RemoteBook.cs. `SeedConfiguration`
 * (C# `TorrentSeedConfiguration`, from NzbDrone.Core/Download/Clients/) is
 * omitted -- no DecisionEngine specification reads it.
 */
export interface RemoteBook {
  release: ReleaseInfo;
  parsedBookInfo: ParsedBookInfo;
  author: AuthorWithQualityProfile;
  books: Book[];
  downloadAllowed: boolean;
  customFormats: CustomFormat[];
  customFormatScore: number;
  releaseSource: ReleaseSourceType;
}

export function newRemoteBook(overrides: Partial<RemoteBook> = {}): RemoteBook {
  return {
    release: undefined as unknown as ReleaseInfo,
    parsedBookInfo: undefined as unknown as ParsedBookInfo,
    author: undefined as unknown as AuthorWithQualityProfile,
    books: [],
    downloadAllowed: false,
    customFormats: [],
    customFormatScore: 0,
    releaseSource: ReleaseSourceType.Unknown,
    ...overrides,
  };
}

/** Ported from `RemoteBook.ToString()`. */
export function remoteBookToString(remoteBook: RemoteBook): string {
  return remoteBook.release.title;
}

/** Ported from `RemoteBook.IsRecentBook()`. */
export function isRecentBook(remoteBook: RemoteBook): boolean {
  const cutoff = Date.now() - 14 * 24 * 60 * 60 * 1000;
  return remoteBook.books.some(
    (b) => b.releaseDate !== null && new Date(b.releaseDate).getTime() >= cutoff
  );
}

/**
 * Forward-ref for NzbDrone.Core/IndexerSearch/Definitions/SearchCriteriaBase.cs
 * (abstract base) + AuthorSearchCriteria.cs + BookSearchCriteria.cs (its two
 * concrete subclasses). C# uses subclassing + `as BookSearchCriteria`
 * (SingleBookSearchMatchSpecification); ported here as a single interface
 * with an optional discriminant field (`kind`) standing in for the C# type
 * check, since TS has no runtime class-based `is` check on plain data.
 */
export interface SearchCriteriaBase {
  kind: "author" | "book";
  monitoredBooksOnly: boolean;
  userInvokedSearch: boolean;
  interactiveSearch: boolean;
  /**
   * Typed `AuthorWithQualityProfile` (not plain `Author`) since
   * `DownloadDecisionMaker.GetBookDecisions` assigns this straight onto
   * `RemoteBook.Author` on the "shove in the searched author" fallback path
   * (`remoteBook.Author = searchCriteria.Author`) -- in the real app this is
   * the same fully-hydrated `Author` (QualityProfile resolved) that the
   * search-command layer looked up before building the criteria.
   */
  author: AuthorWithQualityProfile;
  books: Book[];
}

/** Forward-ref for NzbDrone.Core/IndexerSearch/Definitions/BookSearchCriteria.cs. */
export interface BookSearchCriteria extends SearchCriteriaBase {
  kind: "book";
  bookTitle: string;
  bookYear: number;
  bookIsbn?: string;
  disambiguation?: string;
}

/** Stands in for the C# `searchCriteria as BookSearchCriteria` pattern (SingleBookSearchMatchSpecification). */
export function isBookSearchCriteria(criteria: SearchCriteriaBase): criteria is BookSearchCriteria {
  return criteria.kind === "book";
}

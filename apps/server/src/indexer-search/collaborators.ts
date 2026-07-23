/**
 * Forward-reference collaborator types for IndexerSearch.
 *
 * DEVIATION (forward references, documented per PORT_PLAN.md and the
 * project brief -- same pattern as qualities/qualityModelComparer.ts's
 * `QualityProfileLike`/`QualityIndexLike`). The real C# IndexerSearch
 * module (`NzbDrone.Core/IndexerSearch/*.cs`) depends on four sibling
 * subsystems that are NOT ported in this worktree:
 *
 *   - `NzbDrone.Core.Indexers` (`IIndexer`, `IIndexerFactory`,
 *     `IndexerDefinition`) -- being ported in parallel on branch
 *     `port/indexers`, an isolated worktree that will not be merged before
 *     this one finishes (see PORT_PLAN.md Phase 2 staging note).
 *   - `NzbDrone.Core.Parser.Model` (`ReleaseInfo`) -- part of the `Parser`
 *     module, ported in parallel on a separate branch/worktree.
 *   - `NzbDrone.Core.DecisionEngine` (`DownloadDecision`, `Rejection`,
 *     `RejectionType`, `IMakeDownloadDecision`) -- the `DecisionEngine`
 *     module, ported in parallel on a separate branch/worktree.
 *   - `NzbDrone.Core.Download` (`IProcessDownloadDecisions`,
 *     `ProcessedDecisions`) and `NzbDrone.Core.Queue` (`IQueueService`) --
 *     both Phase 3/4 modules (PORT_PLAN.md), not yet staged at all.
 *
 * Per the project brief, each is ported here as the minimal local
 * interface/type this module's code actually calls, copied field-for-field
 * from the real C# interfaces/classes so a human reviewer can swap in the
 * real implementations at merge time with no call-site changes (structural
 * typing means any real class satisfying these shapes just works). Each
 * type below cites its exact C# source file.
 */

import type { Book } from "../books/models.js";
import { PagingSpec } from "../db/paging-spec.js";
import type { SearchCriteriaBase, AuthorSearchCriteria, BookSearchCriteria } from "./models.js";

// ---- NzbDrone.Core/Parser/Model/ReleaseInfo.cs (Parser module) ----

/**
 * Narrowed to the fields IndexerSearch/DecisionEngine call sites in this
 * module actually touch (`IndexerPriority`, used by DeDupeDecisions'
 * tie-break). The real ReleaseInfo carries many more fields (Title, Size,
 * DownloadUrl, PublishDate, Languages, etc.) -- callers passing a real
 * ReleaseInfo satisfy this structurally.
 */
export interface ReleaseInfo {
  guid: string;
  title: string;
  indexerId: number;
  indexerPriority: number;
}

// ---- NzbDrone.Core/DecisionEngine/RejectionType.cs + Rejection.cs ----

/** Ported from NzbDrone.Core/DecisionEngine/RejectionType.cs. */
export enum RejectionType {
  Permanent = "Permanent",
  Temporary = "Temporary",
}

/** Ported from NzbDrone.Core/DecisionEngine/Rejection.cs. */
export interface Rejection {
  reason: string;
  type: RejectionType;
}

// ---- NzbDrone.Core/Parser/Model/RemoteBook.cs (Parser module) ----

/**
 * Narrowed to the fields this module's DeDupeDecisions/GetQualifiedReports-
 * adjacent logic touches (`release.guid`, `release.indexerPriority`,
 * `books`). The real RemoteBook also carries ParsedBookInfo, Author,
 * DownloadAllowed, CustomFormats, etc.
 */
export interface RemoteBook {
  release: ReleaseInfo;
  books: Book[];
}

// ---- NzbDrone.Core/DecisionEngine/DownloadDecision.cs ----

/**
 * Ported from NzbDrone.Core/DecisionEngine/DownloadDecision.cs. The real
 * class exposes `Approved`/`TemporarilyRejected`/`Rejected` as computed
 * properties over `Rejections`; ported here as plain functions
 * (`isApproved`/`isTemporarilyRejected`/`isRejected` below) since this is a
 * structural forward-reference type, not a class with behavior.
 */
export interface DownloadDecision {
  remoteBook: RemoteBook;
  rejections: Rejection[];
}

/** Ported from DownloadDecision.Approved => !Rejections.Any(). */
export function isApproved(decision: DownloadDecision): boolean {
  return decision.rejections.length === 0;
}

/** Ported from DownloadDecision.TemporarilyRejected. */
export function isTemporarilyRejected(decision: DownloadDecision): boolean {
  return (
    decision.rejections.length > 0 &&
    decision.rejections.every((r) => r.type === RejectionType.Temporary)
  );
}

/** Ported from DownloadDecision.Rejected. */
export function isRejected(decision: DownloadDecision): boolean {
  return (
    decision.rejections.length > 0 &&
    decision.rejections.some((r) => r.type === RejectionType.Permanent)
  );
}

// ---- NzbDrone.Core/Indexers/IndexerDefinition.cs ----

/** Narrowed to the fields ReleaseSearchService.Dispatch actually reads (Tags, for the indexer/author tag-intersection filter). */
export interface IndexerDefinitionLike {
  id: number;
  tags: number[];
}

/** Ported from IndexerDefinition.DefaultPriority = 25 (used by DeDupeDecisions' tie-break when a release has no indexer priority). */
export const INDEXER_DEFAULT_PRIORITY = 25;

// ---- NzbDrone.Core/Indexers/IIndexer.cs ----

/**
 * Narrowed to the members ReleaseSearchService actually calls: `Definition`
 * (for the tag filter) and the two `Fetch` overloads (dispatched by search
 * criteria type). `SupportsRss`/`FetchRecent`/`GetDownloadRequest` etc. from
 * the real interface aren't used by this module.
 */
export interface IIndexerLike {
  readonly definition: IndexerDefinitionLike;
  fetch(searchCriteria: BookSearchCriteria): Promise<ReleaseInfo[]>;
  fetchAuthor(searchCriteria: AuthorSearchCriteria): Promise<ReleaseInfo[]>;
}

// ---- NzbDrone.Core/Indexers/IndexerFactory.cs ----

/** Narrowed to the two methods ReleaseSearchService.Dispatch calls. */
export interface IIndexerFactoryLike {
  /** Ported from IIndexerFactory.AutomaticSearchEnabled(bool filterBlockedIndexers = true). */
  automaticSearchEnabled(filterBlockedIndexers?: boolean): IIndexerLike[];
  /** Ported from IIndexerFactory.InteractiveSearchEnabled(bool filterBlockedIndexers = true). */
  interactiveSearchEnabled(filterBlockedIndexers?: boolean): IIndexerLike[];
}

// ---- NzbDrone.Core/DecisionEngine/DownloadDecisionMaker.cs ----

/** Narrowed to the one method ReleaseSearchService.Dispatch calls (GetRssDecision belongs to RssSyncService, not IndexerSearch). */
export interface IMakeDownloadDecisionLike {
  /** Ported from IMakeDownloadDecision.GetSearchDecision(List<ReleaseInfo> reports, SearchCriteriaBase searchCriteriaBase). */
  getSearchDecision(
    reports: ReleaseInfo[],
    searchCriteriaBase: SearchCriteriaBase
  ): DownloadDecision[];
}

// ---- NzbDrone.Core/Download/ProcessDownloadDecisions.cs ----

/** Ported from NzbDrone.Core/Download/ProcessedDecisions.cs. */
export interface ProcessedDecisions {
  grabbed: DownloadDecision[];
  pending: DownloadDecision[];
  rejected: DownloadDecision[];
}

/** Narrowed to the one method AuthorSearchService/BookSearchService call. */
export interface IProcessDownloadDecisionsLike {
  /** Ported from IProcessDownloadDecisions.ProcessDecisions(List<DownloadDecision> decisions). */
  processDecisions(decisions: DownloadDecision[]): Promise<ProcessedDecisions>;
}

// ---- NzbDrone.Core/Books/Services/BookCutoffService.cs ----

/**
 * `IBookCutoffService` is genuinely part of the Books module (not
 * Indexers/Parser/DecisionEngine), but its real implementation
 * (`BookCutoffService.BooksWhereCutoffUnmet`) calls
 * `IBookRepository.BooksWhereCutoffUnmet`, which the already-merged
 * `apps/server/src/books/bookRepository.ts` explicitly does NOT implement
 * -- see that file's module doc comment: it depends on the `BookFile`
 * model (MediaFiles module, Phase 3, not yet ported), so `BookCutoffService`
 * was left unported there "for the same reason", deferred to whichever
 * module needs it next. That's this module. Adding the missing repository
 * method would mean modifying books/bookRepository.ts, which is outside
 * this module's allowed scope (apps/server/src/indexer-search/ only per
 * the port brief) -- so it's forward-referenced here the same way the
 * Indexers/Parser/DecisionEngine collaborators above are, narrowed to the
 * one method BookSearchService calls.
 */
export interface IBookCutoffServiceLike {
  /** Ported from IBookCutoffService.BooksWhereCutoffUnmet(PagingSpec<Book> pagingSpec). */
  booksWhereCutoffUnmet(pagingSpec: PagingSpec<Book>): PagingSpec<Book>;
}

// ---- NzbDrone.Core/Queue/QueueService.cs ----

/** Narrowed to the one field BookSearchService's missing/cutoff-unmet handlers read off each queue item. */
export interface QueueItemLike {
  book: Book | null;
}

/** Narrowed to the one method BookSearchService calls (Find/Remove aren't used by IndexerSearch). */
export interface IQueueServiceLike {
  /** Ported from IQueueService.GetQueue(). */
  getQueue(): QueueItemLike[];
}

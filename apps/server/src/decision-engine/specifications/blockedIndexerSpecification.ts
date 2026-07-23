import { Decision } from "../decision.js";
import { RejectionType } from "../rejectionType.js";
import type { RemoteBook, SearchCriteriaBase } from "../remoteBook.js";
import { SpecificationPriority } from "../specificationPriority.js";
import type { IDecisionEngineSpecification } from "./decisionEngineSpecification.js";

/**
 * Forward-ref for the slice of NzbDrone.Core/Indexers/IIndexerStatusService.cs
 * DecisionEngine reads (module not ported yet -- Indexers is a sibling Phase
 * 2 worktree).
 */
export interface IndexerStatus {
  providerId: number;
  disabledTill: string | null;
}

export interface IndexerStatusServiceLike {
  getBlockedProviders(): IndexerStatus[];
}

/**
 * Ported from NzbDrone.Core/DecisionEngine/Specifications/BlockedIndexerSpecification.cs.
 *
 * DEVIATION: C#'s `ICachedDictionary<IndexerStatus>` (NzbDrone.Common.Cache,
 * not ported) memoizes `GetBlockedProviders()` for 15 seconds, keyed by
 * indexer id. Ported here as a small private TTL cache -- same approach and
 * TTL as delayProfileService.ts's identical documented deviation.
 */
export class BlockedIndexerSpecification implements IDecisionEngineSpecification {
  readonly priority = SpecificationPriority.Database;
  readonly type = RejectionType.Temporary;

  private cache: { byIndexerId: Map<number, IndexerStatus>; expiresAt: number } | null = null;
  private static readonly TTL_MS = 15_000;

  constructor(private readonly indexerStatusService: IndexerStatusServiceLike) {}

  isSatisfiedBy(subject: RemoteBook, _searchCriteria: SearchCriteriaBase | null): Decision {
    const status = this.fetchBlocked().get(subject.release.indexerId);

    if (status != null) {
      return Decision.reject(
        `Indexer ${subject.release.indexer} is blocked till ${status.disabledTill} due to failures, cannot grab release.`
      );
    }

    return Decision.accept();
  }

  private fetchBlocked(): Map<number, IndexerStatus> {
    const now = Date.now();
    if (this.cache && this.cache.expiresAt > now) {
      return this.cache.byIndexerId;
    }

    const byIndexerId = new Map(
      this.indexerStatusService.getBlockedProviders().map((s) => [s.providerId, s])
    );
    this.cache = { byIndexerId, expiresAt: now + BlockedIndexerSpecification.TTL_MS };
    return byIndexerId;
  }
}

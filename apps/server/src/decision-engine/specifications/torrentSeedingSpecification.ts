import { Decision } from "../decision.js";
import { RejectionType } from "../rejectionType.js";
import {
  isTorrentInfo,
  ModelNotFoundException,
  type IndexerFactoryLike,
  type RemoteBook,
  type SearchCriteriaBase,
} from "../remoteBook.js";
import { SpecificationPriority } from "../specificationPriority.js";
import type { IDecisionEngineSpecification } from "./decisionEngineSpecification.js";

/** Ported from NzbDrone.Core/DecisionEngine/Specifications/TorrentSeedingSpecification.cs. */
export class TorrentSeedingSpecification implements IDecisionEngineSpecification {
  readonly priority = SpecificationPriority.Default;
  readonly type = RejectionType.Permanent;

  constructor(private readonly indexerFactory: IndexerFactoryLike) {}

  isSatisfiedBy(remoteBook: RemoteBook, _searchCriteria: SearchCriteriaBase | null): Decision {
    const release = remoteBook.release;

    if (!isTorrentInfo(release) || release.indexerId === 0) {
      return Decision.accept();
    }

    let indexer;
    try {
      indexer = this.indexerFactory.get(release.indexerId);
    } catch (e) {
      if (e instanceof ModelNotFoundException) {
        return Decision.accept();
      }
      throw e;
    }

    const minimumSeeders = indexer.settings?.minimumSeeders;

    if (minimumSeeders != null && release.seeders != null && release.seeders < minimumSeeders) {
      return Decision.reject(
        `Not enough seeders: ${release.seeders}. Minimum seeders: ${minimumSeeders}`
      );
    }

    return Decision.accept();
  }
}

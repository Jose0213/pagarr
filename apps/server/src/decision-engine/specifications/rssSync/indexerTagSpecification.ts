import { Decision } from "../../decision.js";
import { RejectionType } from "../../rejectionType.js";
import {
  ModelNotFoundException,
  type IndexerFactoryLike,
  type RemoteBook,
  type SearchCriteriaBase,
} from "../../remoteBook.js";
import { SpecificationPriority } from "../../specificationPriority.js";
import type { IDecisionEngineSpecification } from "../decisionEngineSpecification.js";

/** Ported from NzbDrone.Core/DecisionEngine/Specifications/RssSync/IndexerTagSpecification.cs. */
export class IndexerTagSpecification implements IDecisionEngineSpecification {
  readonly priority = SpecificationPriority.Default;
  readonly type = RejectionType.Permanent;

  constructor(private readonly indexerFactory: IndexerFactoryLike) {}

  isSatisfiedBy(subject: RemoteBook, _searchCriteria: SearchCriteriaBase | null): Decision {
    if (
      subject.release == null ||
      subject.author?.tags == null ||
      subject.release.indexerId === 0
    ) {
      return Decision.accept();
    }

    let indexer;
    try {
      indexer = this.indexerFactory.get(subject.release.indexerId);
    } catch (e) {
      if (e instanceof ModelNotFoundException) {
        return Decision.accept();
      }
      throw e;
    }

    // If indexer has tags, check that at least one of them is present on the series
    const indexerTags = indexer.tags;
    const authorTags = new Set(subject.author.tags);
    const hasOverlap = [...indexerTags].some((t) => authorTags.has(t));

    if (indexerTags.size > 0 && !hasOverlap) {
      return Decision.reject("Author tags do not match any of the indexer tags");
    }

    return Decision.accept();
  }
}

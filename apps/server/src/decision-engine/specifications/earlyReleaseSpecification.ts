import { Decision } from "../decision.js";
import { RejectionType } from "../rejectionType.js";
import {
  ModelNotFoundException,
  type IndexerFactoryLike,
  type RemoteBook,
  type SearchCriteriaBase,
} from "../remoteBook.js";
import { SpecificationPriority } from "../specificationPriority.js";
import type { IDecisionEngineSpecification } from "./decisionEngineSpecification.js";

/** Ported from NzbDrone.Core/DecisionEngine/Specifications/EarlyReleaseSpecification.cs. */
export class EarlyReleaseSpecification implements IDecisionEngineSpecification {
  readonly priority = SpecificationPriority.Default;
  readonly type = RejectionType.Permanent;

  constructor(private readonly indexerFactory: IndexerFactoryLike) {}

  isSatisfiedBy(subject: RemoteBook, _searchCriteria: SearchCriteriaBase | null): Decision {
    const releaseInfo = subject.release;

    if (releaseInfo == null || releaseInfo.indexerId === 0) {
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

    const earlyReleaseLimit = indexer.settings?.earlyReleaseLimit;

    if (subject.books.length !== 1 || earlyReleaseLimit == null) {
      return Decision.accept();
    }

    const releaseDate = subject.books[0]?.releaseDate;

    if (!releaseDate) {
      return Decision.accept();
    }

    const publishDate = new Date(subject.release.publishDate);
    const limitDate = new Date(publishDate);
    limitDate.setDate(limitDate.getDate() + earlyReleaseLimit);

    const isEarly = new Date(releaseDate).getTime() > limitDate.getTime();

    if (isEarly) {
      return Decision.reject(
        `Release published date, ${publishDate.toLocaleDateString()}, is outside of ${earlyReleaseLimit} day early grab limit allowed by user`
      );
    }

    return Decision.accept();
  }
}

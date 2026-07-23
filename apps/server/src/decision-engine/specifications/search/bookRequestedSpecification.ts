import { Decision } from "../../decision.js";
import { RejectionType } from "../../rejectionType.js";
import type { RemoteBook, SearchCriteriaBase } from "../../remoteBook.js";
import { SpecificationPriority } from "../../specificationPriority.js";
import type { IDecisionEngineSpecification } from "../decisionEngineSpecification.js";

/** Ported from NzbDrone.Core/DecisionEngine/Specifications/Search/BookRequestedSpecification.cs. */
export class BookRequestedSpecification implements IDecisionEngineSpecification {
  readonly priority = SpecificationPriority.Default;
  readonly type = RejectionType.Permanent;

  isSatisfiedBy(remoteBook: RemoteBook, searchCriteria: SearchCriteriaBase | null): Decision {
    if (searchCriteria == null) {
      return Decision.accept();
    }

    const criteriaBookIds = new Set(searchCriteria.books.map((v) => v.id));
    const hasOverlap = remoteBook.books.some((v) => criteriaBookIds.has(v.id));

    if (!hasOverlap) {
      return Decision.reject("Book wasn't requested");
    }

    return Decision.accept();
  }
}

import { Decision } from "../../decision.js";
import { RejectionType } from "../../rejectionType.js";
import type { RemoteBook, SearchCriteriaBase } from "../../remoteBook.js";
import { SpecificationPriority } from "../../specificationPriority.js";
import type { IDecisionEngineSpecification } from "../decisionEngineSpecification.js";

/** Ported from NzbDrone.Core/DecisionEngine/Specifications/Search/AuthorSpecification.cs. */
export class AuthorSpecification implements IDecisionEngineSpecification {
  readonly priority = SpecificationPriority.Default;
  readonly type = RejectionType.Permanent;

  isSatisfiedBy(remoteBook: RemoteBook, searchCriteria: SearchCriteriaBase | null): Decision {
    if (searchCriteria == null) {
      return Decision.accept();
    }

    if (remoteBook.author.id !== searchCriteria.author.id) {
      return Decision.reject("Wrong author");
    }

    return Decision.accept();
  }
}

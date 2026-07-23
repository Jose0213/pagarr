import { Decision } from "../decision.js";
import { RejectionType } from "../rejectionType.js";
import type { RemoteBook, SearchCriteriaBase } from "../remoteBook.js";
import { SpecificationPriority } from "../specificationPriority.js";
import type { IDecisionEngineSpecification } from "./decisionEngineSpecification.js";

const TWENTY_MEGABYTES = 20 * 1024 * 1024;

/** Ported from NzbDrone.Core/DecisionEngine/Specifications/NotSampleSpecification.cs. */
export class NotSampleSpecification implements IDecisionEngineSpecification {
  readonly priority = SpecificationPriority.Default;
  readonly type = RejectionType.Permanent;

  isSatisfiedBy(subject: RemoteBook, _searchCriteria: SearchCriteriaBase | null): Decision {
    if (
      subject.release.title.toLowerCase().includes("sample") &&
      subject.release.size < TWENTY_MEGABYTES
    ) {
      return Decision.reject("Sample");
    }

    return Decision.accept();
  }
}

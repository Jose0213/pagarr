import { Decision } from "../decision.js";
import { RejectionType } from "../rejectionType.js";
import type { RemoteBook, SearchCriteriaBase } from "../remoteBook.js";
import { SpecificationPriority } from "../specificationPriority.js";
import type { IDecisionEngineSpecification } from "./decisionEngineSpecification.js";

const CD_CONTAINER_TYPES = ["vob", "iso"];

/** Ported from NzbDrone.Core/DecisionEngine/Specifications/RawDiskSpecification.cs. */
export class RawDiskSpecification implements IDecisionEngineSpecification {
  readonly priority = SpecificationPriority.Default;
  readonly type = RejectionType.Permanent;

  isSatisfiedBy(subject: RemoteBook, _searchCriteria: SearchCriteriaBase | null): Decision {
    if (
      subject.release == null ||
      !subject.release.container ||
      subject.release.container.trim() === ""
    ) {
      return Decision.accept();
    }

    if (CD_CONTAINER_TYPES.includes(subject.release.container.toLowerCase())) {
      return Decision.reject("Raw CD release");
    }

    return Decision.accept();
  }
}

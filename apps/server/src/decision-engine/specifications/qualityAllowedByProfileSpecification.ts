import { getIndex } from "../../profiles/qualities/qualityProfile.js";
import { Decision } from "../decision.js";
import { RejectionType } from "../rejectionType.js";
import type { RemoteBook, SearchCriteriaBase } from "../remoteBook.js";
import { SpecificationPriority } from "../specificationPriority.js";
import type { IDecisionEngineSpecification } from "./decisionEngineSpecification.js";

/** Ported from NzbDrone.Core/DecisionEngine/Specifications/QualityAllowedByProfileSpecification.cs. */
export class QualityAllowedByProfileSpecification implements IDecisionEngineSpecification {
  readonly priority = SpecificationPriority.Default;
  readonly type = RejectionType.Permanent;

  isSatisfiedBy(subject: RemoteBook, _searchCriteria: SearchCriteriaBase | null): Decision {
    const profile = subject.author.qualityProfile;
    const qualityIndex = getIndex(profile, subject.parsedBookInfo.quality.quality);
    const qualityOrGroup = profile.items[qualityIndex.index];

    if (!qualityOrGroup || !qualityOrGroup.allowed) {
      return Decision.reject(
        `${subject.parsedBookInfo.quality.quality.name} is not wanted in profile`
      );
    }

    return Decision.accept();
  }
}

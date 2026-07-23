import type { IConfigService } from "../../config/configService.js";
import { Decision } from "../decision.js";
import { RejectionType } from "../rejectionType.js";
import {
  ageMinutes,
  DownloadProtocol,
  type RemoteBook,
  type SearchCriteriaBase,
} from "../remoteBook.js";
import { SpecificationPriority } from "../specificationPriority.js";
import type { IDecisionEngineSpecification } from "./decisionEngineSpecification.js";

/** Ported from NzbDrone.Core/DecisionEngine/Specifications/MinimumAgeSpecification.cs. */
export class MinimumAgeSpecification implements IDecisionEngineSpecification {
  readonly priority = SpecificationPriority.Default;
  readonly type = RejectionType.Temporary;

  constructor(private readonly configService: IConfigService) {}

  isSatisfiedBy(subject: RemoteBook, _searchCriteria: SearchCriteriaBase | null): Decision {
    if (subject.release.downloadProtocol !== DownloadProtocol.Usenet) {
      return Decision.accept();
    }

    const age = ageMinutes(subject.release);
    const minimumAge = this.configService.minimumAge;

    if (minimumAge === 0) {
      return Decision.accept();
    }

    if (age < minimumAge) {
      const ageRounded = Math.round(age * 10) / 10;
      return Decision.reject(
        `Only ${ageRounded} minutes old, minimum age is ${minimumAge} minutes`
      );
    }

    return Decision.accept();
  }
}

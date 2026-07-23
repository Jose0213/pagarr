import type { IConfigService } from "../../config/configService.js";
import { Decision } from "../decision.js";
import { RejectionType } from "../rejectionType.js";
import {
  ageDays,
  DownloadProtocol,
  type RemoteBook,
  type SearchCriteriaBase,
} from "../remoteBook.js";
import { SpecificationPriority } from "../specificationPriority.js";
import type { IDecisionEngineSpecification } from "./decisionEngineSpecification.js";

/** Ported from NzbDrone.Core/DecisionEngine/Specifications/RetentionSpecification.cs. */
export class RetentionSpecification implements IDecisionEngineSpecification {
  readonly priority = SpecificationPriority.Default;
  readonly type = RejectionType.Permanent;

  constructor(private readonly configService: IConfigService) {}

  isSatisfiedBy(subject: RemoteBook, _searchCriteria: SearchCriteriaBase | null): Decision {
    if (subject.release.downloadProtocol !== DownloadProtocol.Usenet) {
      return Decision.accept();
    }

    const age = ageDays(subject.release);
    const retention = this.configService.retention;

    if (retention > 0 && age > retention) {
      return Decision.reject("Older than configured retention");
    }

    return Decision.accept();
  }
}

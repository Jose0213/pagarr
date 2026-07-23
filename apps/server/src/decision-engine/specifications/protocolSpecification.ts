import type { DelayProfileService } from "../../profiles/delay/delayProfileService.js";
import { Decision } from "../decision.js";
import { RejectionType } from "../rejectionType.js";
import { DownloadProtocol, type RemoteBook, type SearchCriteriaBase } from "../remoteBook.js";
import { SpecificationPriority } from "../specificationPriority.js";
import type { IDecisionEngineSpecification } from "./decisionEngineSpecification.js";

/** Ported from NzbDrone.Core/DecisionEngine/Specifications/ProtocolSpecification.cs. */
export class ProtocolSpecification implements IDecisionEngineSpecification {
  readonly priority = SpecificationPriority.Default;
  readonly type = RejectionType.Permanent;

  constructor(private readonly delayProfileService: DelayProfileService) {}

  isSatisfiedBy(subject: RemoteBook, _searchCriteria: SearchCriteriaBase | null): Decision {
    const delayProfile = this.delayProfileService.bestForTags(new Set(subject.author.tags));

    if (
      subject.release.downloadProtocol === DownloadProtocol.Usenet &&
      !delayProfile.enableUsenet
    ) {
      return Decision.reject("Usenet is not enabled for this author");
    }

    if (
      subject.release.downloadProtocol === DownloadProtocol.Torrent &&
      !delayProfile.enableTorrent
    ) {
      return Decision.reject("Torrent is not enabled for this author");
    }

    return Decision.accept();
  }
}

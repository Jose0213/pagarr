import { Decision } from "../decision.js";
import { RejectionType } from "../rejectionType.js";
import type { ReleaseInfo, RemoteBook, SearchCriteriaBase } from "../remoteBook.js";
import { SpecificationPriority } from "../specificationPriority.js";
import type { IDecisionEngineSpecification } from "./decisionEngineSpecification.js";

/**
 * Forward-ref for the lookup surface DecisionEngine needs from
 * NzbDrone.Core/Blocklisting/IBlocklistService.cs (module not ported yet --
 * Blocklisting is Phase 4). Only the one method this spec calls.
 */
export interface BlocklistServiceLike {
  blocklisted(authorId: number, release: ReleaseInfo): boolean;
}

/** Ported from NzbDrone.Core/DecisionEngine/Specifications/BlocklistSpecification.cs. */
export class BlocklistSpecification implements IDecisionEngineSpecification {
  readonly priority = SpecificationPriority.Database;
  readonly type = RejectionType.Permanent;

  constructor(private readonly blocklistService: BlocklistServiceLike) {}

  isSatisfiedBy(subject: RemoteBook, _searchCriteria: SearchCriteriaBase | null): Decision {
    if (this.blocklistService.blocklisted(subject.author.id, subject.release)) {
      return Decision.reject("Release is blocklisted");
    }

    return Decision.accept();
  }
}

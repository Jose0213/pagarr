import { Decision } from "../decision.js";
import { RejectionType } from "../rejectionType.js";
import type { RemoteBook, SearchCriteriaBase } from "../remoteBook.js";
import { SpecificationPriority } from "../specificationPriority.js";
import type { IDecisionEngineSpecification } from "./decisionEngineSpecification.js";

/** Ported from NzbDrone.Core/DecisionEngine/Specifications/DiscographySpecification.cs. */
export class DiscographySpecification implements IDecisionEngineSpecification {
  readonly priority = SpecificationPriority.Default;
  readonly type = RejectionType.Permanent;

  isSatisfiedBy(subject: RemoteBook, _searchCriteria: SearchCriteriaBase | null): Decision {
    if (subject.parsedBookInfo.discography) {
      const now = Date.now();
      const notYetReleased = subject.books.some(
        (b) => !b.releaseDate || new Date(b.releaseDate).getTime() > now
      );

      if (notYetReleased) {
        return Decision.reject("Discography release rejected. All books haven't released yet.");
      }
    }

    return Decision.accept();
  }
}

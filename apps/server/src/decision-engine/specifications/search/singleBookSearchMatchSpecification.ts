import { Decision } from "../../decision.js";
import { RejectionType } from "../../rejectionType.js";
import {
  isBookSearchCriteria,
  type RemoteBook,
  type SearchCriteriaBase,
} from "../../remoteBook.js";
import { SpecificationPriority } from "../../specificationPriority.js";
import type { IDecisionEngineSpecification } from "../decisionEngineSpecification.js";

/** Ported from NzbDrone.Core/DecisionEngine/Specifications/Search/SingleBookSearchMatchSpecification.cs. */
export class SingleBookSearchMatchSpecification implements IDecisionEngineSpecification {
  readonly priority = SpecificationPriority.Default;
  readonly type = RejectionType.Permanent;

  isSatisfiedBy(remoteBook: RemoteBook, searchCriteria: SearchCriteriaBase | null): Decision {
    if (searchCriteria == null) {
      return Decision.accept();
    }

    if (!isBookSearchCriteria(searchCriteria)) {
      return Decision.accept();
    }

    const bookTitle = remoteBook.parsedBookInfo.bookTitle;
    const hasBookTitle = Array.isArray(bookTitle) ? bookTitle.length > 0 : Boolean(bookTitle);

    if (!hasBookTitle) {
      return Decision.reject("Full author pack");
    }

    return Decision.accept();
  }
}

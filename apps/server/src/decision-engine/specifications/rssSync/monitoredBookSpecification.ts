import { Decision } from "../../decision.js";
import { RejectionType } from "../../rejectionType.js";
import type { RemoteBook, SearchCriteriaBase } from "../../remoteBook.js";
import { SpecificationPriority } from "../../specificationPriority.js";
import type { IDecisionEngineSpecification } from "../decisionEngineSpecification.js";

/** Ported from NzbDrone.Core/DecisionEngine/Specifications/RssSync/MonitoredBookSpecification.cs. */
export class MonitoredBookSpecification implements IDecisionEngineSpecification {
  readonly priority = SpecificationPriority.Default;
  readonly type = RejectionType.Permanent;

  isSatisfiedBy(subject: RemoteBook, searchCriteria: SearchCriteriaBase | null): Decision {
    if (searchCriteria != null) {
      if (!searchCriteria.monitoredBooksOnly) {
        return Decision.accept();
      }
    }

    if (!subject.author.monitored) {
      return Decision.reject("Author is not monitored");
    }

    const monitoredCount = subject.books.filter((b) => b.monitored).length;
    if (monitoredCount === subject.books.length) {
      return Decision.accept();
    }

    if (subject.books.length === 1) {
      return Decision.reject("Book is not monitored");
    }

    return Decision.reject("Book is not monitored");
  }
}

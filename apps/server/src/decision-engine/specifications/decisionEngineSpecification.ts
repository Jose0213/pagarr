import type { Decision } from "../decision.js";
import type { RejectionType } from "../rejectionType.js";
import type { RemoteBook, SearchCriteriaBase } from "../remoteBook.js";
import type { SpecificationPriority } from "../specificationPriority.js";

/**
 * Ported from NzbDrone.Core/DecisionEngine/Specifications/IDecisionEngineSpecification.cs.
 *
 * Every spec under `specifications/` implements this. C#'s DI container
 * discovers all `IDecisionEngineSpecification` implementations via
 * reflection/assembly scanning and injects the full `IEnumerable<...>` into
 * `DownloadDecisionMaker`'s constructor. This port has no reflection-based
 * auto-discovery -- per this project's established "explicit over
 * reflection" pattern (see PORT_PLAN.md's Datastore module notes), the full
 * list of specification instances is built explicitly in
 * `downloadDecisionMaker.ts`'s `createDefaultSpecifications()`.
 */
export interface IDecisionEngineSpecification {
  readonly type: RejectionType;
  readonly priority: SpecificationPriority;

  isSatisfiedBy(subject: RemoteBook, searchCriteria: SearchCriteriaBase | null): Decision;
}

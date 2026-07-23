import { Decision } from "../decision.js";
import { RejectionType } from "../rejectionType.js";
import type { RemoteBook, SearchCriteriaBase } from "../remoteBook.js";
import { SpecificationPriority } from "../specificationPriority.js";
import type { IDecisionEngineSpecification } from "./decisionEngineSpecification.js";

/**
 * Ported from NzbDrone.Core/DecisionEngine/Specifications/AcceptableSizeSpecification.cs.
 *
 * FAITHFUL PORT OF A DISABLED CHECK: the real C# source has the entire size
 * check commented out and unconditionally returns `Decision.Accept()` --
 * this is not a bug in the port, it's the actual shipped behavior (see the
 * `/* ... *\/` block in the C# file, left in place there as dead code for a
 * future re-enable). Ported here exactly as dead/inert to match: the size
 * logic is preserved in this comment for reference, not executed.
 *
 *   var quality = subject.ParsedBookInfo.Quality.Quality;
 *   if (subject.Release.Size == 0) return Decision.Accept();
 *   var qualityDefinition = _qualityDefinitionService.Get(quality);
 *   if (qualityDefinition.MinSize.HasValue) { ... reject if Release.Size < MinSize ... }
 *   if (qualityDefinition.MaxSize.HasValue && != 0) { ... reject if Release.Size > MaxSize ... }
 *   return Decision.Accept();
 */
export class AcceptableSizeSpecification implements IDecisionEngineSpecification {
  readonly priority = SpecificationPriority.Default;
  readonly type = RejectionType.Permanent;

  isSatisfiedBy(_subject: RemoteBook, _searchCriteria: SearchCriteriaBase | null): Decision {
    return Decision.accept();
  }
}

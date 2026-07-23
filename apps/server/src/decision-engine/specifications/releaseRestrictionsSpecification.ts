import type { ReleaseProfileService } from "../../profiles/releases/releaseProfileService.js";
import type { TermMatcherService } from "../../profiles/releases/termMatcherService.js";
import { Decision } from "../decision.js";
import { RejectionType } from "../rejectionType.js";
import type { RemoteBook, SearchCriteriaBase } from "../remoteBook.js";
import { SpecificationPriority } from "../specificationPriority.js";
import type { IDecisionEngineSpecification } from "./decisionEngineSpecification.js";

/** Ported from NzbDrone.Core/DecisionEngine/Specifications/ReleaseRestrictionsSpecification.cs. Uses the real, already-ported Profiles module's ReleaseProfileService + TermMatcherService directly. */
export class ReleaseRestrictionsSpecification implements IDecisionEngineSpecification {
  readonly priority = SpecificationPriority.Default;
  readonly type = RejectionType.Permanent;

  constructor(
    private readonly termMatcherService: TermMatcherService,
    private readonly releaseProfileService: ReleaseProfileService
  ) {}

  isSatisfiedBy(subject: RemoteBook, _searchCriteria: SearchCriteriaBase | null): Decision {
    const title = subject.release.title;
    const releaseProfiles = this.releaseProfileService.enabledForTags(
      new Set(subject.author.tags),
      subject.release.indexerId
    );

    const required = releaseProfiles.filter((r) => r.required.length > 0);
    const ignored = releaseProfiles.filter((r) => r.ignored.length > 0);

    for (const r of required) {
      const requiredTerms = r.required;
      const foundTerms = this.containsAny(requiredTerms, title);

      if (foundTerms.length === 0) {
        const terms = requiredTerms.join(", ");
        return Decision.reject(`Does not contain one of the required terms: ${terms}`);
      }
    }

    for (const r of ignored) {
      const ignoredTerms = r.ignored;
      const foundTerms = this.containsAny(ignoredTerms, title);

      if (foundTerms.length > 0) {
        const terms = foundTerms.join(", ");
        return Decision.reject(`Contains these ignored terms: ${terms}`);
      }
    }

    return Decision.accept();
  }

  private containsAny(terms: string[], title: string): string[] {
    return terms.filter((t) => this.termMatcherService.isMatch(t, title));
  }
}

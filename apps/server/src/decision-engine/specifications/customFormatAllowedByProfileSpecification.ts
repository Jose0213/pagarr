import { Decision } from "../decision.js";
import { RejectionType } from "../rejectionType.js";
import type { RemoteBook, SearchCriteriaBase } from "../remoteBook.js";
import { SpecificationPriority } from "../specificationPriority.js";
import type { IDecisionEngineSpecification } from "./decisionEngineSpecification.js";

/**
 * Ported from
 * NzbDrone.Core/DecisionEngine/Specifications/CustomFormatAllowedByProfileSpecification.cs.
 * C# class name is `CustomFormatAllowedbyProfileSpecification` (lowercase
 * "by") -- kept as the conventionally-cased `CustomFormatAllowedByProfileSpecification`
 * here (matching this port's general casing convention) since nothing
 * outside the C# assembly ever referenced the class by name/reflection.
 */
export class CustomFormatAllowedByProfileSpecification implements IDecisionEngineSpecification {
  readonly priority = SpecificationPriority.Default;
  readonly type = RejectionType.Permanent;

  isSatisfiedBy(subject: RemoteBook, _searchCriteria: SearchCriteriaBase | null): Decision {
    const minScore = subject.author.qualityProfile.minFormatScore;
    const score = subject.customFormatScore;

    if (score < minScore) {
      const formats = subject.customFormats.map((f) => f.name).join(", ");
      return Decision.reject(
        `Custom Formats ${formats} have score ${score} below Author profile minimum ${minScore}`
      );
    }

    return Decision.accept();
  }
}

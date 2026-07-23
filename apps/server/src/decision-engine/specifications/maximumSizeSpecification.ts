import type { IConfigService } from "../../config/configService.js";
import { Decision } from "../decision.js";
import { RejectionType } from "../rejectionType.js";
import type { RemoteBook, SearchCriteriaBase } from "../remoteBook.js";
import { SpecificationPriority } from "../specificationPriority.js";
import type { IDecisionEngineSpecification } from "./decisionEngineSpecification.js";

/** Ported from NzbDrone.Core/DecisionEngine/Specifications/MaximumSizeSpecification.cs. `_configService.MaximumSize.Megabytes()` -- config stores MB, converted to bytes here. */
export class MaximumSizeSpecification implements IDecisionEngineSpecification {
  readonly priority = SpecificationPriority.Default;
  readonly type = RejectionType.Permanent;

  constructor(private readonly configService: IConfigService) {}

  isSatisfiedBy(subject: RemoteBook, _searchCriteria: SearchCriteriaBase | null): Decision {
    const size = subject.release.size;
    const maximumSize = this.configService.maximumSize * 1024 * 1024;

    if (maximumSize === 0) {
      return Decision.accept();
    }

    if (subject.release.size === 0) {
      return Decision.accept();
    }

    if (size > maximumSize) {
      return Decision.reject(
        `${sizeSuffix(size)} is too big, maximum size is ${sizeSuffix(maximumSize)} (Settings->Indexers->Maximum Size)`
      );
    }

    return Decision.accept();
  }
}

/**
 * Minimal stand-in for NzbDrone.Common.Extensions.BytesExtension.SizeSuffix(),
 * used only for the human-readable rejection message text.
 */
function sizeSuffix(bytes: number): string {
  const units = ["bytes", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }

  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

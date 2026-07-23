import type { CheckOnEntry } from "../checkOnAttribute.js";
import {
  createHealthCheck,
  createOkHealthCheck,
  HealthCheckResult,
  type HealthCheck,
} from "../healthCheck.js";
import { HealthCheckBase } from "../healthCheckBase.js";
import type { ILocalizationService } from "../localizationService.js";
import { formatMessage } from "./_shared.js";

/**
 * Ported from NzbDrone.Core/HealthCheck/Checks/ReleaseBranchCheck.cs.
 *
 * `[CheckOn(typeof(ConfigSavedEvent))]` NOT reproduced -- see
 * `apiKeyValidationCheck.ts`'s doc comment.
 *
 * `IConfigFileProvider.Branch` is real (`config/configFileProvider.ts`'s
 * `ConfigFileProvider.branch` getter). The `ReleaseBranches` nested enum
 * (`Develop`, `Nightly` -- `Master` commented out in the real source,
 * preserved faithfully as a comment below, NOT added as a valid value) is
 * ported as a plain readonly array of lowercase branch names, matching
 * `Enum.GetNames(typeof(ReleaseBranches)).Any(x => x.ToLower() ==
 * currentBranch)`'s case-insensitive comparison.
 */
export const CHECK_ON: CheckOnEntry[] = [];

/**
 * Ported from `ReleaseBranchCheck.ReleaseBranches` enum. `Master` is
 * commented out in the real C# source (`// ToDo Enable Master as valid once
 * released`) -- preserved faithfully as NOT a valid branch here either.
 */
const VALID_RELEASE_BRANCHES = ["develop", "nightly"] as const;

export interface ReleaseBranchCheckConfig {
  readonly branch: string;
}

export class ReleaseBranchCheck extends HealthCheckBase {
  constructor(
    private readonly configFileService: ReleaseBranchCheckConfig,
    localizationService: ILocalizationService
  ) {
    super(localizationService);
  }

  check(): HealthCheck {
    const currentBranch = this.configFileService.branch.toLowerCase();

    if (
      !VALID_RELEASE_BRANCHES.includes(currentBranch as (typeof VALID_RELEASE_BRANCHES)[number])
    ) {
      return createHealthCheck(
        ReleaseBranchCheck,
        HealthCheckResult.Warning,
        formatMessage(
          this.localizationService.getLocalizedString("ReleaseBranchCheckOfficialBranchMessage"),
          this.configFileService.branch
        ),
        "#branch-is-not-a-valid-release-branch"
      );
    }

    return createOkHealthCheck(ReleaseBranchCheck);
  }
}

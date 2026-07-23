import { describe, expect, it } from "vitest";
import { HealthCheckResult } from "../../healthCheck.js";
import { NullLocalizationService } from "../../localizationService.js";
import { ReleaseBranchCheck } from "../releaseBranchCheck.js";

/** Translated from NzbDrone.Core.Test/HealthCheck/Checks/ReleaseBranchCheckFixture.cs. */

describe("ReleaseBranchCheck", () => {
  // "master" is intentionally included here even though it's real Readarr's
  // (eventual) primary branch name -- the C# source's ReleaseBranches enum
  // literally comments out `Master` ("ToDo Enable Master as valid once
  // released") and the real fixture asserts master is STILL a warning today.
  it.each(["book-index", "phantom", "master"])(
    "should_return_warning_when_branch_is_not_valid (%s)",
    (branch) => {
      const check = new ReleaseBranchCheck({ branch }, new NullLocalizationService());

      expect(check.check().type).toBe(HealthCheckResult.Warning);
    }
  );

  it.each(["nightly", "Nightly", "develop", "Develop"])(
    "should_return_no_warning_when_branch_valid (%s)",
    (branch) => {
      const check = new ReleaseBranchCheck({ branch }, new NullLocalizationService());

      expect(check.check().type).toBe(HealthCheckResult.Ok);
    }
  );
});

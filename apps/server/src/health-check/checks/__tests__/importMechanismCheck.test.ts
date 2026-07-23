import { describe, expect, it } from "vitest";
import { HealthCheckResult } from "../../healthCheck.js";
import { NullLocalizationService } from "../../localizationService.js";
import { ImportMechanismCheck } from "../importMechanismCheck.js";

/** Translated from NzbDrone.Core.Test/HealthCheck/Checks/ImportMechanismCheckFixture.cs. */

describe("ImportMechanismCheck", () => {
  it("should_return_warning_when_completed_download_handling_not_configured", () => {
    const check = new ImportMechanismCheck(
      { enableCompletedDownloadHandling: false },
      new NullLocalizationService()
    );

    expect(check.check().type).toBe(HealthCheckResult.Warning);
  });

  it("should_return_ok_when_no_issues_found", () => {
    const check = new ImportMechanismCheck(
      { enableCompletedDownloadHandling: true },
      new NullLocalizationService()
    );

    expect(check.check().type).toBe(HealthCheckResult.Ok);
  });
});

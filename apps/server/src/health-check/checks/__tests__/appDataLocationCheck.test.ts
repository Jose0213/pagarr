import { describe, expect, it } from "vitest";
import { HealthCheckResult } from "../../healthCheck.js";
import { NullLocalizationService } from "../../localizationService.js";
import { AppDataLocationCheck } from "../appDataLocationCheck.js";

/** Translated from NzbDrone.Core.Test/HealthCheck/Checks/AppDataLocationFixture.cs. */

describe("AppDataLocationCheck", () => {
  it("should_return_warning_when_app_data_is_child_of_startup_folder", () => {
    const check = new AppDataLocationCheck(
      { startUpFolder: "/NzbDrone", appDataFolder: "/NzbDrone/AppData" },
      new NullLocalizationService()
    );

    expect(check.check().type).toBe(HealthCheckResult.Warning);
  });

  it("should_return_warning_when_app_data_is_same_as_startup_folder", () => {
    const check = new AppDataLocationCheck(
      { startUpFolder: "/NzbDrone", appDataFolder: "/NzbDrone" },
      new NullLocalizationService()
    );

    expect(check.check().type).toBe(HealthCheckResult.Warning);
  });

  it("should_return_ok_when_no_conflict", () => {
    const check = new AppDataLocationCheck(
      { startUpFolder: "/NzbDrone", appDataFolder: "/ProgramData/NzbDrone" },
      new NullLocalizationService()
    );

    expect(check.check().type).toBe(HealthCheckResult.Ok);
  });
});

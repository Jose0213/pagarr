import { describe, expect, it } from "vitest";
import { HealthCheckResult } from "../../healthCheck.js";
import { NullLocalizationService } from "../../localizationService.js";
import { PackageGlobalMessageCheck } from "../packageGlobalMessageCheck.js";

/** New tests -- no dedicated C# fixture exists for PackageGlobalMessageCheck. */

describe("PackageGlobalMessageCheck", () => {
  it("returns Ok when there is no message", () => {
    const check = new PackageGlobalMessageCheck(
      { packageGlobalMessage: null },
      new NullLocalizationService()
    );

    expect(check.check().type).toBe(HealthCheckResult.Ok);
  });

  it("returns Ok when the message is blank/whitespace", () => {
    const check = new PackageGlobalMessageCheck(
      { packageGlobalMessage: "   " },
      new NullLocalizationService()
    );

    expect(check.check().type).toBe(HealthCheckResult.Ok);
  });

  it("returns Notice for a plain message with no prefix", () => {
    const check = new PackageGlobalMessageCheck(
      { packageGlobalMessage: "Just letting you know" },
      new NullLocalizationService()
    );

    const result = check.check();
    expect(result.type).toBe(HealthCheckResult.Notice);
    expect(result.message).toBe("Just letting you know");
  });

  it("returns Error and strips the Error: prefix", () => {
    const check = new PackageGlobalMessageCheck(
      { packageGlobalMessage: "Error:Something is very wrong" },
      new NullLocalizationService()
    );

    const result = check.check();
    expect(result.type).toBe(HealthCheckResult.Error);
    expect(result.message).toBe("Something is very wrong");
  });

  it("returns Warning and strips the Warn: prefix", () => {
    const check = new PackageGlobalMessageCheck(
      { packageGlobalMessage: "Warn:Please update soon" },
      new NullLocalizationService()
    );

    const result = check.check();
    expect(result.type).toBe(HealthCheckResult.Warning);
    expect(result.message).toBe("Please update soon");
  });
});

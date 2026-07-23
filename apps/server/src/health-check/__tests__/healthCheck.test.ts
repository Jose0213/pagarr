import { describe, expect, it } from "vitest";
import {
  createHealthCheck,
  createOkHealthCheck,
  healthCheckSourceName,
  HealthCheckResult,
} from "../healthCheck.js";

class SomeCheck {}

describe("healthCheck", () => {
  it("createOkHealthCheck produces a type=Ok result with no message/wikiUrl", () => {
    const result = createOkHealthCheck(SomeCheck);

    expect(result.source).toBe(SomeCheck);
    expect(result.type).toBe(HealthCheckResult.Ok);
    expect(result.message).toBeNull();
    expect(result.wikiUrl).toBeNull();
  });

  it("createHealthCheck derives a wiki fragment from the message when none is given", () => {
    const result = createHealthCheck(
      SomeCheck,
      HealthCheckResult.Warning,
      "Some Message: With Punctuation!"
    );

    expect(result.type).toBe(HealthCheckResult.Warning);
    expect(result.message).toBe("Some Message: With Punctuation!");
    // Ported from CleanFragmentRegex ("[^a-z ]") applied to the lowercased
    // message, then spaces -> hyphens: punctuation/colon/digits stripped.
    expect(result.wikiUrl!.toString()).toBe(
      "https://wiki.servarr.com/readarr/system#some-message-with-punctuation"
    );
  });

  it("createHealthCheck uses an explicit wikiFragment when given, without deriving one from the message", () => {
    const result = createHealthCheck(
      SomeCheck,
      HealthCheckResult.Error,
      "Ignored for fragment purposes",
      "#custom-fragment"
    );

    expect(result.wikiUrl!.toString()).toBe(
      "https://wiki.servarr.com/readarr/system#custom-fragment"
    );
  });

  it("healthCheckSourceName reads the class's constructor name", () => {
    expect(healthCheckSourceName(SomeCheck)).toBe("SomeCheck");
  });
});

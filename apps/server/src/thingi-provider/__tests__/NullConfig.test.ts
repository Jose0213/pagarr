import { describe, expect, it } from "vitest";
import { NULL_CONFIG_INSTANCE, NullConfig } from "../NullConfig.js";

/** Translated from NzbDrone.Core.Test/ThingiProviderTests/NullConfigFixture.cs. */
describe("NullConfig", () => {
  it("should_be_valid", () => {
    expect(new NullConfig().validate().isValid).toBe(true);
  });

  it("the shared singleton instance validates as valid too", () => {
    expect(NULL_CONFIG_INSTANCE.validate().isValid).toBe(true);
    expect(NULL_CONFIG_INSTANCE.validate().hasWarnings).toBe(false);
    expect(NULL_CONFIG_INSTANCE.validate().errors).toEqual([]);
  });
});

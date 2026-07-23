import { describe, expect, it } from "vitest";
import { createProviderDefinition, setProviderDefinitionSettings } from "../ProviderDefinition.js";
import type { IProviderConfig, ValidationResult } from "../IProviderConfig.js";

function fakeConfig(): IProviderConfig {
  return {
    validate: (): ValidationResult => ({ isValid: true, hasWarnings: false, errors: [] }),
  };
}

describe("createProviderDefinition", () => {
  it("defaults tags to an empty array, matching ProviderDefinition's ctor (Tags = new HashSet<int>())", () => {
    const definition = createProviderDefinition();
    expect(definition.tags).toEqual([]);
    expect(definition.id).toBe(0);
    expect(definition.settings).toBeNull();
    expect(definition.enable).toBe(false);
    expect(definition.message).toBeNull();
  });

  it("accepts overrides", () => {
    const definition = createProviderDefinition({
      name: "My Provider",
      enable: true,
      tags: [1, 2],
    });
    expect(definition.name).toBe("My Provider");
    expect(definition.enable).toBe(true);
    expect(definition.tags).toEqual([1, 2]);
  });
});

describe("setProviderDefinitionSettings", () => {
  it("assigns settings and stamps configContract when settings is non-null, matching the C# setter side effect", () => {
    const definition = createProviderDefinition();
    const settings = fakeConfig();

    setProviderDefinitionSettings(definition, settings, "MySettings");

    expect(definition.settings).toBe(settings);
    expect(definition.configContract).toBe("MySettings");
  });

  it("assigns null settings without touching configContract", () => {
    const definition = createProviderDefinition({ configContract: "Existing" });

    setProviderDefinitionSettings(definition, null);

    expect(definition.settings).toBeNull();
    expect(definition.configContract).toBe("Existing");
  });
});

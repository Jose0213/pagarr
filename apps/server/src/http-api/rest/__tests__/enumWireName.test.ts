import { describe, expect, it } from "vitest";
import { buildEnumWireNames, enumWireName } from "../enumWireName.js";

enum Sample {
  Queued = 0,
  Started = 1,
  Failed = 3,
}

describe("enumWireName", () => {
  it("camelCases each member name, keyed by ordinal", () => {
    const names = buildEnumWireNames(Sample);

    expect(enumWireName(names, Sample.Queued)).toBe("queued");
    expect(enumWireName(names, Sample.Started)).toBe("started");
    expect(enumWireName(names, Sample.Failed)).toBe("failed");
  });

  it("throws for an ordinal with no registered member", () => {
    const names = buildEnumWireNames(Sample);

    expect(() => enumWireName(names, 99)).toThrow(/No wire name registered/);
  });
});

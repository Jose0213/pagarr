import { describe, expect, it } from "vitest";
import { didMatch, type SpecificationMatchesGroup } from "../specificationMatchesGroup.js";
import { ReleaseTitleSpecification } from "../specifications/releaseTitleSpecification.js";
import type { ICustomFormatSpecification } from "../specifications/customFormatSpecification.js";

function spec(
  overrides: Partial<Pick<ICustomFormatSpecification, "required">> = {}
): ReleaseTitleSpecification {
  const s = new ReleaseTitleSpecification();
  s.required = overrides.required ?? false;
  return s;
}

/**
 * Ported behavior test for SpecificationMatchesGroup.DidMatch:
 * `!(Matches.Any(m => m.Key.Required && m.Value == false) || Matches.All(m => m.Value == false))`
 */
describe("didMatch (SpecificationMatchesGroup.DidMatch)", () => {
  it("matches when at least one non-required spec matches and none required failed", () => {
    const a = spec();
    const b = spec();
    const group: SpecificationMatchesGroup = {
      matches: new Map([
        [a, true],
        [b, false],
      ]),
    };

    expect(didMatch(group)).toBe(true);
  });

  it("does not match when every spec in the group fails", () => {
    const a = spec();
    const b = spec();
    const group: SpecificationMatchesGroup = {
      matches: new Map([
        [a, false],
        [b, false],
      ]),
    };

    expect(didMatch(group)).toBe(false);
  });

  it("does not match when a required spec fails, even if another spec matched", () => {
    const required = spec({ required: true });
    const optional = spec();
    const group: SpecificationMatchesGroup = {
      matches: new Map([
        [required, false],
        [optional, true],
      ]),
    };

    expect(didMatch(group)).toBe(false);
  });

  it("matches when the required spec matches", () => {
    const required = spec({ required: true });
    const group: SpecificationMatchesGroup = {
      matches: new Map([[required, true]]),
    };

    expect(didMatch(group)).toBe(true);
  });

  it("matches on a single non-required matching spec (single-spec group, common case)", () => {
    const only = spec();
    const group: SpecificationMatchesGroup = {
      matches: new Map([[only, true]]),
    };

    expect(didMatch(group)).toBe(true);
  });
});

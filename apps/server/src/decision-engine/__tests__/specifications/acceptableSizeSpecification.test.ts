import { describe, expect, it } from "vitest";
import { AcceptableSizeSpecification } from "../../specifications/acceptableSizeSpecification.js";
import { makeReleaseInfo, makeRemoteBook } from "../testFixtures.js";

/**
 * Ported from NzbDrone.Core/DecisionEngine/Specifications/AcceptableSizeSpecification.cs
 * -- the real C# spec always accepts (its size-checking logic is commented
 * out; see the port's own header comment for the faithfully-preserved dead
 * code). No dedicated C# test fixture exists for this spec either, since
 * there is nothing but the trivial always-accept behavior to test.
 */
describe("AcceptableSizeSpecification", () => {
  const subject = new AcceptableSizeSpecification();

  it("always accepts, regardless of size", () => {
    expect(
      subject.isSatisfiedBy(makeRemoteBook({ release: makeReleaseInfo({ size: 0 }) }), null)
        .accepted
    ).toBe(true);
    expect(
      subject.isSatisfiedBy(
        makeRemoteBook({ release: makeReleaseInfo({ size: Number.MAX_SAFE_INTEGER }) }),
        null
      ).accepted
    ).toBe(true);
  });
});

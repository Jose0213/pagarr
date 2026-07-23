import { describe, expect, it } from "vitest";
import type { IConfigService } from "../../../config/configService.js";
import { MaximumSizeSpecification } from "../../specifications/maximumSizeSpecification.js";
import { makeReleaseInfo, makeRemoteBook } from "../testFixtures.js";

/** Ported from NzbDrone.Core.Test/DecisionEngineTests/MaximumSizeSpecificationFixture.cs. */
describe("MaximumSizeSpecification", () => {
  function makeSubject(maximumSize: number): MaximumSizeSpecification {
    return new MaximumSizeSpecification({ maximumSize } as IConfigService);
  }

  function remoteBookWithSizeMb(sizeMb: number) {
    return makeRemoteBook({ release: makeReleaseInfo({ size: sizeMb * 1024 * 1024 }) });
  }

  it("should_return_true_when_maximum_size_is_set_to_zero", () => {
    const subject = makeSubject(0);
    expect(subject.isSatisfiedBy(remoteBookWithSizeMb(1000), null).accepted).toBe(true);
  });

  it("should_return_true_when_size_is_smaller_than_maximum_size", () => {
    const subject = makeSubject(2000);
    expect(subject.isSatisfiedBy(remoteBookWithSizeMb(1999), null).accepted).toBe(true);
  });

  it("should_return_true_when_size_is_equals_to_maximum_size", () => {
    const subject = makeSubject(2000);
    expect(subject.isSatisfiedBy(remoteBookWithSizeMb(2000), null).accepted).toBe(true);
  });

  it("should_return_false_when_size_is_bigger_than_maximum_size", () => {
    const subject = makeSubject(2000);
    expect(subject.isSatisfiedBy(remoteBookWithSizeMb(2001), null).accepted).toBe(false);
  });

  it("should_return_true_when_size_is_zero", () => {
    const subject = makeSubject(2000);
    expect(subject.isSatisfiedBy(remoteBookWithSizeMb(0), null).accepted).toBe(true);
  });
});

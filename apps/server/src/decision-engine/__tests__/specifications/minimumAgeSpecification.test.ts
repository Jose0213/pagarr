import { describe, expect, it } from "vitest";
import type { IConfigService } from "../../../config/configService.js";
import { MinimumAgeSpecification } from "../../specifications/minimumAgeSpecification.js";
import { DownloadProtocol } from "../../remoteBook.js";
import { makeReleaseInfo, makeRemoteBook } from "../testFixtures.js";

/** Ported from NzbDrone.Core.Test/DecisionEngineTests/MinimumAgeSpecificationFixture.cs. */
describe("MinimumAgeSpecification", () => {
  function makeSubject(minimumAge: number): MinimumAgeSpecification {
    return new MinimumAgeSpecification({ minimumAge } as IConfigService);
  }

  function remoteBookAgedMinutes(minutes: number) {
    return makeRemoteBook({
      release: makeReleaseInfo({
        downloadProtocol: DownloadProtocol.Usenet,
        publishDate: new Date(Date.now() - minutes * 60 * 1000).toISOString(),
      }),
    });
  }

  it("should_return_true_when_minimum_age_is_set_to_zero", () => {
    const subject = makeSubject(0);
    expect(subject.isSatisfiedBy(remoteBookAgedMinutes(100), null).accepted).toBe(true);
  });

  it("should_return_true_when_age_is_greater_than_minimum_age", () => {
    const subject = makeSubject(30);
    expect(subject.isSatisfiedBy(remoteBookAgedMinutes(100), null).accepted).toBe(true);
  });

  it("should_return_false_when_age_is_less_than_minimum_age", () => {
    const subject = makeSubject(30);
    expect(subject.isSatisfiedBy(remoteBookAgedMinutes(10), null).accepted).toBe(false);
  });

  it("should_return_true_for_non_usenet_protocol_regardless_of_age", () => {
    const subject = makeSubject(30);
    const remoteBook = makeRemoteBook({
      release: makeReleaseInfo({
        downloadProtocol: DownloadProtocol.Torrent,
        publishDate: new Date(Date.now() - 1000).toISOString(),
      }),
    });
    expect(subject.isSatisfiedBy(remoteBook, null).accepted).toBe(true);
  });
});

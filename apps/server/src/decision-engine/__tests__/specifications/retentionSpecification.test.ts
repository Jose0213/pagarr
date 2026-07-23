import { describe, expect, it } from "vitest";
import type { IConfigService } from "../../../config/configService.js";
import { RetentionSpecification } from "../../specifications/retentionSpecification.js";
import { DownloadProtocol } from "../../remoteBook.js";
import { makeReleaseInfo, makeRemoteBook } from "../testFixtures.js";

/** Ported from NzbDrone.Core.Test/DecisionEngineTests/RetentionSpecificationFixture.cs. */
describe("RetentionSpecification", () => {
  function makeSubject(retention: number): RetentionSpecification {
    return new RetentionSpecification({ retention } as IConfigService);
  }

  function remoteBookAgedDays(days: number, protocol: DownloadProtocol = DownloadProtocol.Usenet) {
    return makeRemoteBook({
      release: makeReleaseInfo({
        downloadProtocol: protocol,
        publishDate: new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString(),
      }),
    });
  }

  it("should_return_true_when_retention_is_set_to_zero", () => {
    const subject = makeSubject(0);
    expect(subject.isSatisfiedBy(remoteBookAgedDays(100), null).accepted).toBe(true);
  });

  it("should_return_true_when_release_if_younger_than_retention", () => {
    const subject = makeSubject(1000);
    expect(subject.isSatisfiedBy(remoteBookAgedDays(100), null).accepted).toBe(true);
  });

  it("should_return_true_when_release_and_retention_are_the_same", () => {
    const subject = makeSubject(100);
    expect(subject.isSatisfiedBy(remoteBookAgedDays(100), null).accepted).toBe(true);
  });

  it("should_return_false_when_old_than_retention", () => {
    const subject = makeSubject(10);
    expect(subject.isSatisfiedBy(remoteBookAgedDays(100), null).accepted).toBe(false);
  });

  it("should_return_true_when_release_is_not_usenet", () => {
    const subject = makeSubject(10);
    expect(
      subject.isSatisfiedBy(remoteBookAgedDays(100, DownloadProtocol.Torrent), null).accepted
    ).toBe(true);
  });
});

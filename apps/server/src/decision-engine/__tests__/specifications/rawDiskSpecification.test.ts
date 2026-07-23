import { describe, expect, it } from "vitest";
import { RawDiskSpecification } from "../../specifications/rawDiskSpecification.js";
import { DownloadProtocol } from "../../remoteBook.js";
import { makeReleaseInfo, makeRemoteBook } from "../testFixtures.js";

/** Ported from NzbDrone.Core.Test/DecisionEngineTests/RawDiskSpecificationFixture.cs. */
describe("RawDiskSpecification", () => {
  const subject = new RawDiskSpecification();

  function remoteBookWithContainer(container: string | null) {
    return makeRemoteBook({
      release: makeReleaseInfo({ downloadProtocol: DownloadProtocol.Torrent, container }),
    });
  }

  it("should_return_true_if_no_container_specified", () => {
    expect(subject.isSatisfiedBy(remoteBookWithContainer(null), null).accepted).toBe(true);
  });

  it("should_return_true_if_flac", () => {
    expect(subject.isSatisfiedBy(remoteBookWithContainer("FLAC"), null).accepted).toBe(true);
  });

  it("should_return_false_if_vob", () => {
    expect(subject.isSatisfiedBy(remoteBookWithContainer("VOB"), null).accepted).toBe(false);
  });

  it("should_return_false_if_iso", () => {
    expect(subject.isSatisfiedBy(remoteBookWithContainer("ISO"), null).accepted).toBe(false);
  });

  it("should_compare_case_insensitive", () => {
    expect(subject.isSatisfiedBy(remoteBookWithContainer("vob"), null).accepted).toBe(false);
  });
});

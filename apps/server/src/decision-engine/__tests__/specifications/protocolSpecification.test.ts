import { describe, expect, it, vi } from "vitest";
import { ProtocolSpecification } from "../../specifications/protocolSpecification.js";
import { DownloadProtocol } from "../../remoteBook.js";
import { newDelayProfile, type DelayProfile } from "../../../profiles/delay/delayProfile.js";
import type { DelayProfileService } from "../../../profiles/delay/delayProfileService.js";
import { makeReleaseInfo, makeRemoteBook } from "../testFixtures.js";

/** Ported from NzbDrone.Core.Test/DecisionEngineTests/ProtocolSpecificationFixture.cs. */
describe("ProtocolSpecification", () => {
  function makeSubject(delayProfile: DelayProfile): ProtocolSpecification {
    const delayProfileService = {
      bestForTags: vi.fn(() => delayProfile),
    } as unknown as DelayProfileService;
    return new ProtocolSpecification(delayProfileService);
  }

  function remoteBookWithProtocol(protocol: DownloadProtocol) {
    return makeRemoteBook({ release: makeReleaseInfo({ downloadProtocol: protocol }) });
  }

  it("should_be_true_if_usenet_and_usenet_is_enabled", () => {
    const subject = makeSubject(newDelayProfile({ enableUsenet: true }));
    expect(
      subject.isSatisfiedBy(remoteBookWithProtocol(DownloadProtocol.Usenet), null).accepted
    ).toBe(true);
  });

  it("should_be_true_if_torrent_and_torrent_is_enabled", () => {
    const subject = makeSubject(newDelayProfile({ enableTorrent: true }));
    expect(
      subject.isSatisfiedBy(remoteBookWithProtocol(DownloadProtocol.Torrent), null).accepted
    ).toBe(true);
  });

  it("should_be_false_if_usenet_and_usenet_is_disabled", () => {
    const subject = makeSubject(newDelayProfile({ enableUsenet: false }));
    expect(
      subject.isSatisfiedBy(remoteBookWithProtocol(DownloadProtocol.Usenet), null).accepted
    ).toBe(false);
  });

  it("should_be_false_if_torrent_and_torrent_is_disabled", () => {
    const subject = makeSubject(newDelayProfile({ enableTorrent: false }));
    expect(
      subject.isSatisfiedBy(remoteBookWithProtocol(DownloadProtocol.Torrent), null).accepted
    ).toBe(false);
  });
});

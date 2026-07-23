import { describe, expect, it } from "vitest";
import { DownloadProtocol, getProtocolDelay, newDelayProfile } from "../delay/delayProfile.js";
import { delayProfileTagsAreValid } from "../delay/delayProfileTagInUseValidator.js";
import { DelayProfileService } from "../delay/delayProfileService.js";
import type { DelayProfileRepository } from "../delay/delayProfileRepository.js";

describe("getProtocolDelay", () => {
  it("returns TorrentDelay for the Torrent protocol", () => {
    const profile = newDelayProfile({ usenetDelay: 10, torrentDelay: 20 });
    expect(getProtocolDelay(profile, DownloadProtocol.Torrent)).toBe(20);
  });

  it("returns UsenetDelay for any other protocol", () => {
    const profile = newDelayProfile({ usenetDelay: 10, torrentDelay: 20 });
    expect(getProtocolDelay(profile, DownloadProtocol.Usenet)).toBe(10);
    expect(getProtocolDelay(profile, DownloadProtocol.Unknown)).toBe(10);
  });
});

/** Ported behavior from NzbDrone.Core/Profiles/Delay/DelayProfileTagInUseValidator.cs (no C# unit test exists to translate). */
describe("delayProfileTagsAreValid", () => {
  function makeService(all: ReturnType<typeof newDelayProfile>[]): DelayProfileService {
    const repo = { all: () => all } as unknown as DelayProfileRepository;
    return new DelayProfileService(repo);
  }

  it("is valid when no other profile claims any of the tags", () => {
    const service = makeService([
      newDelayProfile({ id: 1, tags: new Set([1, 2]) }),
      newDelayProfile({ id: 2, tags: new Set([3]) }),
    ]);

    expect(delayProfileTagsAreValid(service, 2, new Set([4, 5]))).toBe(true);
  });

  it("is invalid when another profile already claims one of the tags", () => {
    const service = makeService([
      newDelayProfile({ id: 1, tags: new Set([1, 2]) }),
      newDelayProfile({ id: 2, tags: new Set([3]) }),
    ]);

    expect(delayProfileTagsAreValid(service, 2, new Set([2, 9]))).toBe(false);
  });

  it("ignores the profile's own existing tags (matched by instanceId)", () => {
    const service = makeService([newDelayProfile({ id: 1, tags: new Set([1, 2]) })]);

    expect(delayProfileTagsAreValid(service, 1, new Set([1, 2]))).toBe(true);
  });

  it("is valid for null/empty tag sets", () => {
    const service = makeService([newDelayProfile({ id: 1, tags: new Set([1]) })]);

    expect(delayProfileTagsAreValid(service, 2, null)).toBe(true);
    expect(delayProfileTagsAreValid(service, 2, new Set())).toBe(true);
  });
});

import { describe, expect, it, vi } from "vitest";
import { ReleaseRestrictionsSpecification } from "../../specifications/releaseRestrictionsSpecification.js";
import { TermMatcherService } from "../../../profiles/releases/termMatcherService.js";
import {
  newReleaseProfile,
  type ReleaseProfile,
} from "../../../profiles/releases/releaseProfile.js";
import type { ReleaseProfileService } from "../../../profiles/releases/releaseProfileService.js";
import { makeAuthor, makeReleaseInfo, makeRemoteBook } from "../testFixtures.js";

/** Ported from NzbDrone.Core.Test/DecisionEngineTests/ReleaseRestrictionsSpecificationFixture.cs. */
describe("ReleaseRestrictionsSpecification", () => {
  const termMatcherService = new TermMatcherService();

  function makeService(profiles: ReleaseProfile[]): ReleaseProfileService {
    return { enabledForTags: vi.fn(() => profiles) } as unknown as ReleaseProfileService;
  }

  function buildRemoteBook(title: string) {
    return makeRemoteBook({
      author: makeAuthor({ tags: [] }),
      release: makeReleaseInfo({ title }),
    });
  }

  it("should_be_true_when_restrictions_are_empty", () => {
    const subject = new ReleaseRestrictionsSpecification(termMatcherService, makeService([]));
    const remoteBook = buildRemoteBook("Dexter.S08E01.EDITED.WEBRip.x264-KYR");

    expect(subject.isSatisfiedBy(remoteBook, null).accepted).toBe(true);
  });

  it("should_be_true_when_title_contains_one_required_term", () => {
    const subject = new ReleaseRestrictionsSpecification(
      termMatcherService,
      makeService([newReleaseProfile({ required: ["WEBRip"], ignored: [] })])
    );
    const remoteBook = buildRemoteBook("Dexter.S08E01.EDITED.WEBRip.x264-KYR");

    expect(subject.isSatisfiedBy(remoteBook, null).accepted).toBe(true);
  });

  it("should_be_false_when_title_does_not_contain_any_required_terms", () => {
    const subject = new ReleaseRestrictionsSpecification(
      termMatcherService,
      makeService([newReleaseProfile({ required: ["doesnt", "exist"], ignored: [] })])
    );
    const remoteBook = buildRemoteBook("Dexter.S08E01.EDITED.WEBRip.x264-KYR");

    expect(subject.isSatisfiedBy(remoteBook, null).accepted).toBe(false);
  });

  it("should_be_true_when_title_does_not_contain_any_ignored_terms", () => {
    const subject = new ReleaseRestrictionsSpecification(
      termMatcherService,
      makeService([newReleaseProfile({ required: [], ignored: ["ignored"] })])
    );
    const remoteBook = buildRemoteBook("Dexter.S08E01.EDITED.WEBRip.x264-KYR");

    expect(subject.isSatisfiedBy(remoteBook, null).accepted).toBe(true);
  });

  it("should_be_false_when_title_contains_one_anded_ignored_terms", () => {
    const subject = new ReleaseRestrictionsSpecification(
      termMatcherService,
      makeService([newReleaseProfile({ required: [], ignored: ["edited"] })])
    );
    const remoteBook = buildRemoteBook("Dexter.S08E01.EDITED.WEBRip.x264-KYR");

    expect(subject.isSatisfiedBy(remoteBook, null).accepted).toBe(false);
  });

  it.each(["EdiTED", "webrip", "X264", "X264,NOTTHERE"])(
    "should_ignore_case_when_matching_required: %s",
    (required) => {
      const subject = new ReleaseRestrictionsSpecification(
        termMatcherService,
        makeService([newReleaseProfile({ required: required.split(","), ignored: [] })])
      );
      const remoteBook = buildRemoteBook("Dexter.S08E01.EDITED.WEBRip.x264-KYR");

      expect(subject.isSatisfiedBy(remoteBook, null).accepted).toBe(true);
    }
  );

  it.each(["EdiTED", "webrip", "X264", "X264,NOTTHERE"])(
    "should_ignore_case_when_matching_ignored: %s",
    (ignored) => {
      const subject = new ReleaseRestrictionsSpecification(
        termMatcherService,
        makeService([newReleaseProfile({ required: [], ignored: ignored.split(",") })])
      );
      const remoteBook = buildRemoteBook("Dexter.S08E01.EDITED.WEBRip.x264-KYR");

      expect(subject.isSatisfiedBy(remoteBook, null).accepted).toBe(false);
    }
  );

  it("should_be_false_when_release_contains_one_restricted_word_and_one_required_word", () => {
    const subject = new ReleaseRestrictionsSpecification(
      termMatcherService,
      makeService([newReleaseProfile({ required: ["320"], ignored: ["www.Speed.cd"] })])
    );
    const remoteBook = buildRemoteBook(
      "[ www.Speed.cd ] - Katy Perry - Witness (2017) MP3 [320 kbps] "
    );

    expect(subject.isSatisfiedBy(remoteBook, null).accepted).toBe(false);
  });

  it.each([
    ["/WEB/", true],
    ["/WEB\\b/", false],
    ["/WEb/", false],
    ["/\\.WEB/", true],
  ] as const)("should_match_perl_regex: %s -> %s", (pattern, expected) => {
    const subject = new ReleaseRestrictionsSpecification(
      termMatcherService,
      makeService([newReleaseProfile({ required: [pattern], ignored: [] })])
    );
    const remoteBook = buildRemoteBook("Dexter.S08E01.EDITED.WEBRip.x264-KYR");

    expect(subject.isSatisfiedBy(remoteBook, null).accepted).toBe(expected);
  });
});

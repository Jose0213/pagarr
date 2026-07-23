import { describe, expect, it } from "vitest";
import { TermMatcherService } from "../releases/termMatcherService.js";

/** Ported behavior from NzbDrone.Core/Profiles/Releases/TermMatcherService.cs (no C# unit test exists to translate). */
describe("TermMatcherService", () => {
  it("uses a regex matcher for a /pattern/ term", () => {
    const service = new TermMatcherService();
    expect(service.isMatch("/^foo/", "foobar")).toBe(true);
    expect(service.isMatch("/^foo/", "barfoo")).toBe(false);
  });

  it("uses a case-insensitive substring matcher for a plain term", () => {
    const service = new TermMatcherService();
    expect(service.isMatch("BadGroup", "release.by.badgroup")).toBe(true);
  });

  it("matchingTerm proxies to the underlying matcher", () => {
    const service = new TermMatcherService();
    expect(service.matchingTerm("BadGroup", "release.by.badgroup")).toBe("BadGroup");
  });

  it("caches the matcher per term (repeated calls don't rebuild the regex)", () => {
    const service = new TermMatcherService();
    const first = service.getMatcher("/foo/");
    const second = service.getMatcher("/foo/");
    expect(first).toBe(second);
  });
});

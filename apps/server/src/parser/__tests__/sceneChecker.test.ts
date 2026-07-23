import { describe, expect, it } from "vitest";
import { isSceneTitle } from "../sceneChecker.js";

/**
 * New tests (SceneChecker.cs has no dedicated C# test fixture). Covers the
 * two fast-path false-negative guards ("no dot" / "has space") plus the
 * full parse-based check.
 */
describe("isSceneTitle", () => {
  it("returns false when the title has no dot", () => {
    expect(isSceneTitle("SomeTitleWithoutDots")).toBe(false);
  });

  it("returns false when the title contains a space", () => {
    expect(isSceneTitle("Some.Title With Spaces.mp3")).toBe(false);
  });

  it("returns false for a title that fails to parse", () => {
    expect(isSceneTitle("a.b.c.d.e.f")).toBe(false);
  });

  it("prefers false negatives: an ambiguous scene-like title without a clean quality/release-group match returns false", () => {
    // Matches the C# doc comment's stated bias -- this is not asserting a
    // specific true case exists (the fixture-worthy true cases are scene
    // TV/movie releases outside this book/audio-focused module's regex
    // library), only that the guard rails hold for non-matching input.
    expect(isSceneTitle("random.dotted.title.without.quality.or.group")).toBe(false);
  });
});

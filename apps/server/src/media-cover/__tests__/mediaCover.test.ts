import { describe, expect, it } from "vitest";
import { MediaCover, MediaCoverTypes } from "../mediaCover.js";

/**
 * No dedicated C# test fixture exists for the `MediaCover` class itself
 * (it's exercised indirectly through MediaCoverServiceFixture.cs). These
 * tests target the class's own documented behavior directly: the
 * constructor's `Url` assignment, and the sticky-extension `Url` setter.
 */
describe("MediaCover", () => {
  it("defaults coverType to Unknown and url to empty string", () => {
    const cover = new MediaCover();
    expect(cover.coverType).toBe(MediaCoverTypes.Unknown);
    expect(cover.url).toBe("");
    expect(cover.extension).toBe("");
  });

  it("derives extension from the url the constructor sets", () => {
    const cover = new MediaCover(MediaCoverTypes.Poster, "http://example.com/cover.jpg");
    expect(cover.extension).toBe(".jpg");
  });

  it("extension is empty when the url has no extension", () => {
    const cover = new MediaCover(MediaCoverTypes.Poster, "http://example.com/cover");
    expect(cover.extension).toBe("");
  });

  it("re-assigning url does NOT recompute an already-set extension (sticky)", () => {
    const cover = new MediaCover(MediaCoverTypes.Poster, "http://example.com/cover.jpg");
    expect(cover.extension).toBe(".jpg");

    cover.url = "/MediaCover/12/poster.png";
    expect(cover.url).toBe("/MediaCover/12/poster.png");
    // Extension stays .jpg -- it was already set on first assignment.
    expect(cover.extension).toBe(".jpg");
  });

  it("extension is (re)computed once a non-blank url is first assigned", () => {
    const cover = new MediaCover(MediaCoverTypes.Poster, "");
    expect(cover.extension).toBe("");

    cover.url = "http://example.com/cover.png";
    expect(cover.extension).toBe(".png");

    cover.url = "http://example.com/other.jpg";
    expect(cover.extension).toBe(".png");
  });

  it("remoteUrl defaults to null", () => {
    const cover = new MediaCover(MediaCoverTypes.Poster, "http://example.com/cover.jpg");
    expect(cover.remoteUrl).toBeNull();
  });
});

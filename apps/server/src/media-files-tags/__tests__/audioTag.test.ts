import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AudioTag } from "../audioTag.js";
import { buildSilentWav } from "./testAudioFixture.js";

/**
 * Partial translation of NzbDrone.Core.Test/MediaFiles/AudioTagServiceFixture.cs
 * against a synthetic WAV fixture (see testAudioFixture.ts for why WAV
 * instead of the original's checked-in MP3/FLAC/etc. binaries). Covers:
 * `should_read_duration`-equivalent (properties read correctly),
 * `should_read_write_tags`-equivalent (generic fields + ID3v2 Media/Date/
 * OriginalReleaseDate round-trip), `should_read_audiotag_from_file_with_no_tags`,
 * `should_set_quality_and_mediainfo_for_corrupt_file` (missing file),
 * `should_remove_date_from_tags_when_not_in_metadata`, and `Diff`'s field
 * comparisons (new tests -- the C# fixture never unit-tests `Diff`
 * directly, only indirectly via retag-preview integration tests this
 * module doesn't port).
 */

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "audiotag-test-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function writeFixture(name = "test.wav"): string {
  const path = join(dir, name);
  writeFileSync(path, buildSilentWav({ durationSeconds: 1.5 }));
  return path;
}

describe("AudioTag.read", () => {
  it("is invalid but still gets a non-null Quality/MediaInfo fallback for a missing file (should_set_quality_and_mediainfo_for_corrupt_file)", () => {
    // Matches the real C# fixture's assertions exactly (it only checks
    // Quality/MediaInfo are non-null, never a specific
    // QualityDetectionSource -- for a real codec-bearing filename like
    // "missing.mp3" `parseQuality` finds the codec from the *name* before
    // ever reaching the extension-fallback branch, same as here).
    const tag = new AudioTag(join(dir, "missing-track.wav"));
    expect(tag.isValid).toBe(false);
    expect(tag.quality).not.toBeNull();
    expect(tag.mediaInfo).not.toBeNull();
  });

  it("reads duration from a real WAV file", () => {
    const path = writeFixture();
    const tag = new AudioTag(path);
    expect(tag.isValid).toBe(true);
    // 1.5s = 1500ms, allow a small tolerance.
    expect(tag.durationMs).toBeGreaterThan(1400);
    expect(tag.durationMs).toBeLessThan(1600);
  });

  it("reads mediaInfo (audio format/channels/bitrate/sampleRate) from a real WAV file", () => {
    const path = writeFixture();
    const tag = new AudioTag(path);
    expect(tag.mediaInfo?.audioChannels).toBe(1);
    expect(tag.mediaInfo?.audioSampleRate).toBe(8000);
    expect(tag.mediaInfo?.audioFormat).toContain("PCM");
  });

  it("round-trips generic tag fields (title, performers, album, track) via write() then read()", () => {
    const path = writeFixture();
    const tag = new AudioTag(path);

    tag.title = "My Book Title";
    tag.performers = ["Narrator One"];
    tag.bookAuthors = ["Author One"];
    tag.book = "My Book";
    tag.track = 3;
    tag.trackCount = 10;
    tag.disc = 1;
    tag.discCount = 2;
    tag.publisher = "Test Publisher";
    tag.genres = ["Fiction"];

    tag.write(path);

    const written = new AudioTag(path);
    expect(written.title).toBe("My Book Title");
    expect(written.performers).toEqual(["Narrator One"]);
    expect(written.book).toBe("My Book");
    expect(written.track).toBe(3);
    expect(written.trackCount).toBe(10);
    expect(written.disc).toBe(1);
    expect(written.discCount).toBe(2);
    expect(written.publisher).toBe("Test Publisher");
    expect(written.genres).toEqual(["Fiction"]);
  });

  it("round-trips the ID3v2-specific Media/Date/OriginalReleaseDate fields", () => {
    const path = writeFixture();
    const tag = new AudioTag(path);

    tag.media = "CD";
    tag.date = new Date(Date.UTC(2019, 2, 1));
    tag.originalReleaseDate = new Date(Date.UTC(2009, 3, 1));

    tag.write(path);

    const written = new AudioTag(path);
    expect(written.media).toBe("CD");
    expect(written.date?.toISOString().slice(0, 10)).toBe("2019-03-01");
    expect(written.originalReleaseDate?.toISOString().slice(0, 10)).toBe("2009-04-01");
  });

  it("removes date fields from disk when written as null (should_remove_date_from_tags_when_not_in_metadata)", () => {
    const path = writeFixture();
    const tag = new AudioTag(path);
    tag.date = new Date(Date.UTC(2019, 2, 1));
    tag.originalReleaseDate = new Date(Date.UTC(2009, 3, 1));
    tag.write(path);

    tag.date = null;
    tag.originalReleaseDate = null;
    tag.write(path);

    const onDisk = new AudioTag(path);
    expect(onDisk.date).toBeNull();
    expect(onDisk.originalReleaseDate).toBeNull();
  });

  it("reads an untagged file with empty performers/bookAuthors/genres after RemoveAllTags-equivalent state", () => {
    const path = writeFixture();
    const tag = new AudioTag(path);
    expect(tag.isValid).toBe(true);
    expect(tag.performers).toEqual([]);
    expect(tag.bookAuthors).toEqual([]);
    expect(tag.genres).toEqual([]);
    expect(tag.title).toBeNull();
  });
});

describe("AudioTag.diff", () => {
  function validTag(overrides: Partial<AudioTag> = {}): AudioTag {
    const tag = new AudioTag();
    tag.performers = [];
    tag.bookAuthors = [];
    tag.genres = [];
    Object.assign(tag, overrides);
    return tag;
  }

  it("returns no diff when either tag is invalid", () => {
    const invalid = new AudioTag(join(dir, "missing.wav"));
    const valid = validTag({ title: "X" });
    expect(Object.keys(valid.diff(invalid))).toHaveLength(0);
    expect(Object.keys(invalid.diff(valid))).toHaveLength(0);
  });

  it("reports a Title diff when titles differ", () => {
    const a = validTag({ title: "A" });
    const b = validTag({ title: "B" });
    expect(a.diff(b)["Title"]).toEqual(["A", "B"]);
  });

  it("reports no diff for identical tags", () => {
    const a = validTag({ title: "Same", book: "Book" });
    const b = validTag({ title: "Same", book: "Book" });
    expect(Object.keys(a.diff(b))).toHaveLength(0);
  });

  it("reports an Author diff joined with ' / ' for multiple performers", () => {
    const a = validTag({ performers: ["One"] });
    const b = validTag({ performers: ["One", "Two"] });
    expect(a.diff(b)["Author"]).toEqual(["One", "One / Two"]);
  });

  it("collapses OriginalReleaseDate to an Original Year diff when the date is Jan 1 (ID3v2.3 year-only precision)", () => {
    const a = validTag({ originalReleaseDate: new Date(Date.UTC(2009, 0, 1)) });
    const b = validTag({ originalReleaseDate: new Date(Date.UTC(2015, 0, 1)) });
    const diff = a.diff(b);
    expect(diff["Original Year"]).toEqual(["2009", "2015"]);
    expect(diff["Original Release Date"]).toBeUndefined();
  });

  it("reports a full Original Release Date diff when the date isn't Jan 1", () => {
    const a = validTag({ originalReleaseDate: new Date(Date.UTC(2009, 3, 15)) });
    const b = validTag({ originalReleaseDate: new Date(Date.UTC(2015, 5, 1)) });
    const diff = a.diff(b);
    expect(diff["Original Release Date"]).toEqual(["2009-04-15", "2015-06-01"]);
  });

  it("reports an Image Size diff", () => {
    const a = validTag({ imageSize: 100 });
    const b = validTag({ imageSize: 200 });
    expect(a.diff(b)["Image Size"]).toEqual(["100", "200"]);
  });
});

describe("AudioTag.toParsedTrackInfo", () => {
  it("falls back to performers for Authors when bookAuthors is empty", () => {
    const tag = new AudioTag();
    tag.isValid = true;
    tag.performers = ["Perf One"];
    tag.bookAuthors = [];
    tag.genres = [];
    tag.title = "T";
    tag.book = null;

    const info = tag.toParsedTrackInfo();
    expect(info.authors).toEqual(["Perf One"]);
    expect(info.bookTitle).toBe("T");
  });

  it("prefers bookAuthors over performers when both are present", () => {
    const tag = new AudioTag();
    tag.isValid = true;
    tag.performers = ["Perf One"];
    tag.bookAuthors = ["Book Author"];
    tag.genres = [];

    const info = tag.toParsedTrackInfo();
    expect(info.authors).toEqual(["Book Author"]);
  });

  it("uses Book as bookTitle when present, else Title", () => {
    const tag = new AudioTag();
    tag.isValid = true;
    tag.performers = [];
    tag.bookAuthors = [];
    tag.genres = [];
    tag.book = "The Book";
    tag.title = "Track Title";

    expect(tag.toParsedTrackInfo().bookTitle).toBe("The Book");
  });

  it("returns Unknown quality for an invalid tag with no quality set", () => {
    const tag = new AudioTag();
    // isValid defaults to true from the parameterless constructor; force false to hit the invalid branch.
    tag.isValid = false;
    const info = tag.toParsedTrackInfo();
    expect(info.quality?.quality.name).toBe("Unknown Text");
  });
});

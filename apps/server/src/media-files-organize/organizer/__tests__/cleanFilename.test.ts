import { describe, expect, it } from "vitest";
import { cleanFileNameDefault } from "../fileNameBuilder.js";

/** Ported from NzbDrone.Core.Test/OrganizerTests/CleanFilenameFixture.cs. */
describe("FileNameBuilder.CleanFileName (CleanFilenameFixture)", () => {
  it("should_replaace_invalid_characters", () => {
    expect(cleanFileNameDefault("Law & Order: Criminal Intent - S10E07 - Icarus [HDTV-720p]")).toBe(
      "Law & Order - Criminal Intent - S10E07 - Icarus [HDTV-720p]"
    );
  });

  it("should_remove_periods_from_start", () => {
    expect(cleanFileNameDefault(".hack s01e01")).toBe("hack s01e01");
  });

  it("should_remove_spaces_from_start_and_end (leading)", () => {
    expect(cleanFileNameDefault(" Series Title - S01E01 - Episode Title")).toBe(
      "Series Title - S01E01 - Episode Title"
    );
  });

  it("should_remove_spaces_from_start_and_end (trailing)", () => {
    expect(cleanFileNameDefault("Series Title - S01E01 - Episode Title ")).toBe(
      "Series Title - S01E01 - Episode Title"
    );
  });
});

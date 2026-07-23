import { describe, expect, it } from "vitest";
import { cleanFileName } from "../fileNameCleaner.js";

describe("cleanFileName", () => {
  it("replaces bad characters with their good-character substitutes", () => {
    expect(cleanFileName('a/b\\c<d>e?f*g|h"i')).toBe("a+b+cde!f-ghi");
  });

  it("applies the Smart colon replacement (': ' -> ' - ', ':' -> '-')", () => {
    expect(cleanFileName("Title: Subtitle")).toBe("Title - Subtitle");
    expect(cleanFileName("Time:12:00")).toBe("Time-12-00");
  });

  it("trims leading spaces/dots and trailing spaces", () => {
    expect(cleanFileName("  ..Title  ")).toBe("Title");
  });

  it("leaves an already-clean title unchanged", () => {
    expect(cleanFileName("Droned.S01E01.Pilot.1080p.WEB-DL-DRONE")).toBe(
      "Droned.S01E01.Pilot.1080p.WEB-DL-DRONE"
    );
  });
});

import { describe, expect, it } from "vitest";
import { XmlCleaner } from "../XmlCleaner.js";

describe("XmlCleaner", () => {
  describe("replaceEntities", () => {
    it("converts named entities to numeric character references", () => {
      expect(XmlCleaner.replaceEntities("Tom &amp; Jerry")).toBe("Tom &#38; Jerry");
    });

    it("leaves plain text untouched", () => {
      expect(XmlCleaner.replaceEntities("no entities here")).toBe("no entities here");
    });

    it("leaves unrecognized entity-shaped text as-is (decode failure falls back to original match)", () => {
      expect(XmlCleaner.replaceEntities("&unknownentity;")).toBe("&unknownentity;");
    });
  });

  describe("replaceUnicode", () => {
    it("strips control characters outside the legal XML 1.0 range", () => {
      const illegalChar = String.fromCharCode(0x1f);
      const withControlChar = "before" + illegalChar + "after";
      expect(XmlCleaner.replaceUnicode(withControlChar)).toBe("beforeafter");
    });

    it("keeps tab, LF, and CR", () => {
      const value =
        "a" +
        String.fromCharCode(9) +
        "b" +
        String.fromCharCode(10) +
        "c" +
        String.fromCharCode(13) +
        "d";
      expect(XmlCleaner.replaceUnicode(value)).toBe(value);
    });

    it("keeps ordinary printable text", () => {
      expect(XmlCleaner.replaceUnicode("Hello, World! 123")).toBe("Hello, World! 123");
    });
  });
});

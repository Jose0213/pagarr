import { describe, expect, it } from "vitest";
import { customFormatsEqual, customFormatToString, newCustomFormat } from "../customFormat.js";

describe("newCustomFormat", () => {
  it("defaults id to 0, includeCustomFormatWhenRenaming to false, and specifications to []", () => {
    const format = newCustomFormat();
    expect(format).toEqual({
      id: 0,
      name: "",
      includeCustomFormatWhenRenaming: false,
      specifications: [],
    });
  });

  it("accepts a name and specifications list (constructor overload)", () => {
    const format = newCustomFormat("My Format", []);
    expect(format.name).toBe("My Format");
  });
});

describe("customFormatToString", () => {
  it("returns Name", () => {
    expect(customFormatToString(newCustomFormat("x264"))).toBe("x264");
  });
});

describe("customFormatsEqual", () => {
  it("is true for two formats with the same id, regardless of other fields", () => {
    const a = { ...newCustomFormat("A"), id: 1 };
    const b = { ...newCustomFormat("B"), id: 1 };
    expect(customFormatsEqual(a, b)).toBe(true);
  });

  it("is false for different ids", () => {
    const a = { ...newCustomFormat("A"), id: 1 };
    const b = { ...newCustomFormat("A"), id: 2 };
    expect(customFormatsEqual(a, b)).toBe(false);
  });

  it("treats null/undefined per reference-equality semantics", () => {
    expect(customFormatsEqual(null, null)).toBe(true);
    expect(customFormatsEqual(undefined, undefined)).toBe(true);
    expect(customFormatsEqual(null, newCustomFormat("A"))).toBe(false);
  });
});

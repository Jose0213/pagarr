import { describe, expect, it } from "vitest";
import { createRegex, tryCreateRegex } from "../releases/perlRegexFactory.js";

/** Ported behavior from NzbDrone.Core/Profiles/Releases/PerlRegexFactory.cs (no C# unit test exists to translate). */
describe("tryCreateRegex", () => {
  it("returns null for a plain (non /.../-wrapped) string", () => {
    expect(tryCreateRegex("plain term")).toBeNull();
  });

  it("parses a /pattern/ with no modifiers", () => {
    const regex = tryCreateRegex("/^foo.*bar$/");
    expect(regex).not.toBeNull();
    expect(regex!.test("foo123bar")).toBe(true);
    expect(regex!.test("nope")).toBe(false);
  });

  it("applies the i (ignore case) modifier", () => {
    const regex = tryCreateRegex("/hello/i")!;
    expect(regex.test("HELLO world")).toBe(true);
  });

  it("applies the m (multiline) modifier", () => {
    const regex = tryCreateRegex("/^bar/m")!;
    expect(regex.test("foo\nbar")).toBe(true);
  });

  it("applies the s (singleline, dot-matches-newline) modifier", () => {
    const regex = tryCreateRegex("/foo.bar/s")!;
    expect(regex.test("foo\nbar")).toBe(true);
  });

  it("combines multiple modifiers", () => {
    const regex = tryCreateRegex("/^BAR/im")!;
    expect(regex.test("foo\nbar")).toBe(true);
  });

  it("throws for the x (IgnorePatternWhitespace) modifier -- unsupported in JS RegExp", () => {
    expect(() => tryCreateRegex("/foo/x")).toThrow(/unsupported perl regex modifier: x/);
  });

  it("throws for the n (ExplicitCapture) modifier -- unsupported in JS RegExp", () => {
    expect(() => tryCreateRegex("/foo/n")).toThrow(/unsupported perl regex modifier: n/);
  });

  it("throws for an unknown modifier", () => {
    expect(() => tryCreateRegex("/foo/z")).toThrow(/Unknown or unsupported perl regex modifier: z/);
  });
});

describe("createRegex", () => {
  it("builds a RegExp directly from pattern + modifiers", () => {
    const regex = createRegex("abc+", "i");
    expect(regex.test("ABCCC")).toBe(true);
  });
});

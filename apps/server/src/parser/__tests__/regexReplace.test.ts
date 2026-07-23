import { describe, expect, it } from "vitest";
import { RegexReplace } from "../regexReplace.js";

/**
 * New tests (RegexReplace.cs has no dedicated C# test fixture -- it's a
 * small utility exercised indirectly through Parser.cs's regex library).
 */
describe("RegexReplace", () => {
  it("replaces all matches with a plain string replacement", () => {
    const r = new RegexReplace("a", "X", "");
    expect(r.replace("banana")).toBe("bXnXnX");
  });

  it("replaces using a callback function", () => {
    const r = new RegexReplace("\\d+", (m) => `[${m}]`, "");
    expect(r.replace("a1b22c333")).toBe("a[1]b[22]c[333]");
  });

  it("is case-insensitive when the 'i' flag is passed", () => {
    const r = new RegexReplace("hello", "hi", "i");
    expect(r.replace("HELLO world")).toBe("hi world");
  });

  it("tryReplace reports whether a match occurred, alongside the replaced string", () => {
    const r = new RegexReplace("foo", "bar", "");
    expect(r.tryReplace("foo baz")).toEqual({ matched: true, result: "bar baz" });
    expect(r.tryReplace("no match here")).toEqual({ matched: false, result: "no match here" });
  });

  it("is reusable across multiple calls (regex state doesn't leak between calls)", () => {
    const r = new RegexReplace("x", "Y", "");
    expect(r.replace("xxx")).toBe("YYY");
    expect(r.replace("xyx")).toBe("YyY");
  });
});

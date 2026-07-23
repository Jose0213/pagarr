import { describe, expect, it } from "vitest";
import { sha256Hash } from "../hashing.js";

describe("sha256Hash", () => {
  it("matches the known SHA-256 hex digest of an empty string", () => {
    expect(sha256Hash("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  });

  it("matches the known SHA-256 hex digest of a simple string", () => {
    // echo -n "hello" | sha256sum
    expect(sha256Hash("hello")).toBe(
      "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824"
    );
  });

  it("is deterministic for the same input", () => {
    expect(sha256Hash("readarr metadata contents")).toBe(sha256Hash("readarr metadata contents"));
  });

  it("differs for different input", () => {
    expect(sha256Hash("a")).not.toBe(sha256Hash("b"));
  });
});

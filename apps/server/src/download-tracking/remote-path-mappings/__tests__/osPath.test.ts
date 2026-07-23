import { describe, expect, it } from "vitest";
import {
  asDirectoryOsPath,
  combineOsPath,
  containsOsPath,
  isEmptyOsPath,
  isRootedOsPath,
  newOsPath,
  OsPathKind,
  subtractOsPath,
} from "../osPath.js";

describe("OsPath", () => {
  it("detects Unix paths (leading slash)", () => {
    expect(newOsPath("/mnt/downloads").kind).toBe(OsPathKind.Unix);
  });

  it("detects Windows paths (drive letter)", () => {
    expect(newOsPath("C:\\downloads").kind).toBe(OsPathKind.Windows);
  });

  it("detects Windows paths (backslash without drive letter, e.g. UNC)", () => {
    expect(newOsPath("\\\\server\\share").kind).toBe(OsPathKind.Windows);
  });

  it("detects Unix paths with forward slashes but no leading slash", () => {
    expect(newOsPath("mnt/downloads").kind).toBe(OsPathKind.Unix);
  });

  it("treats a bare filename as Unknown kind", () => {
    expect(newOsPath("downloads").kind).toBe(OsPathKind.Unknown);
  });

  it("normalizes slashes to match the detected kind", () => {
    expect(newOsPath("C:/downloads/movies").fullPath).toBe("C:\\downloads\\movies");
    expect(newOsPath("/mnt\\downloads").fullPath).toBe("/mnt/downloads");
  });

  it("collapses duplicate slashes for Unix paths", () => {
    expect(newOsPath("/mnt//downloads///movies").fullPath).toBe("/mnt/downloads/movies");
  });

  it("isEmptyOsPath is true for a null/blank path", () => {
    expect(isEmptyOsPath(newOsPath(null))).toBe(true);
    expect(isEmptyOsPath(newOsPath("   "))).toBe(true);
    expect(isEmptyOsPath(newOsPath("/mnt"))).toBe(false);
  });

  it("isRootedOsPath is true for Unix paths starting with /", () => {
    expect(isRootedOsPath(newOsPath("/mnt/downloads"))).toBe(true);
    expect(isRootedOsPath(newOsPath("mnt/downloads"))).toBe(false);
  });

  it("isRootedOsPath is true for Windows drive-letter or UNC paths", () => {
    expect(isRootedOsPath(newOsPath("C:\\downloads"))).toBe(true);
    expect(isRootedOsPath(newOsPath("\\\\server\\share"))).toBe(true);
    expect(isRootedOsPath(newOsPath("downloads", OsPathKind.Windows))).toBe(false);
  });

  it("asDirectoryOsPath appends a trailing separator", () => {
    expect(asDirectoryOsPath(newOsPath("/mnt/downloads")).fullPath).toBe("/mnt/downloads/");
    expect(asDirectoryOsPath(newOsPath("C:\\downloads")).fullPath).toBe("C:\\downloads\\");
  });

  it("asDirectoryOsPath is idempotent (no double trailing separator)", () => {
    expect(asDirectoryOsPath(newOsPath("/mnt/downloads/")).fullPath).toBe("/mnt/downloads/");
  });

  it("containsOsPath is true when the fragments are a prefix", () => {
    const remoteRoot = newOsPath("/downloads/");
    const remoteFile = newOsPath("/downloads/movies/foo");
    expect(containsOsPath(remoteRoot, remoteFile)).toBe(true);
  });

  it("containsOsPath is false when either path is unrooted", () => {
    expect(containsOsPath(newOsPath("downloads"), newOsPath("/downloads/foo"))).toBe(false);
  });

  it("containsOsPath is case-insensitive when either side is Windows", () => {
    expect(containsOsPath(newOsPath("C:\\Downloads"), newOsPath("c:\\downloads\\movies"))).toBe(
      true
    );
  });

  it("combineOsPath appends a relative path onto a directory", () => {
    const result = combineOsPath(newOsPath("/downloads/"), newOsPath("movies/foo"));
    expect(result.fullPath).toBe("/downloads/movies/foo");
  });

  it("combineOsPath returns the right side unchanged if it's already rooted", () => {
    const result = combineOsPath(newOsPath("/downloads/"), newOsPath("/elsewhere/foo"));
    expect(result.fullPath).toBe("/elsewhere/foo");
  });

  it("combineOsPath returns the left side unchanged if the right side is empty", () => {
    const result = combineOsPath(newOsPath("/downloads/"), newOsPath(null));
    expect(result.fullPath).toBe("/downloads/");
  });

  it("combineOsPath throws when combining incompatible platforms", () => {
    const windows = newOsPath("C:\\downloads");
    const unix = newOsPath("/elsewhere");
    expect(() => combineOsPath(windows, unix)).toThrow(/Cannot combine OsPaths/);
  });

  it("subtractOsPath computes the relative remainder between two rooted paths", () => {
    const result = subtractOsPath(newOsPath("/downloads/movies/foo"), newOsPath("/downloads/"));
    expect(result.fullPath).toBe("movies/foo");
  });

  it("subtractOsPath throws for unrooted paths", () => {
    expect(() => subtractOsPath(newOsPath("relative"), newOsPath("/downloads"))).toThrow(
      /relative path for unrooted/
    );
  });

  it("remote-to-local round trip: combine(local, subtract(remote, remoteRoot)) reconstructs the local equivalent", () => {
    const remoteRoot = newOsPath("/downloads/");
    const localRoot = newOsPath("D:\\downloads\\");
    const remoteFile = newOsPath("/downloads/movies/foo.mkv");

    expect(containsOsPath(remoteRoot, remoteFile)).toBe(true);

    const localFile = combineOsPath(localRoot, subtractOsPath(remoteFile, remoteRoot));
    expect(localFile.fullPath).toBe("D:\\downloads\\movies\\foo.mkv");
  });
});

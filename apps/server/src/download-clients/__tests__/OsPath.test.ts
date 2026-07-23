import { describe, expect, it } from "vitest";
import { OsPath, OsPathKind } from "../OsPath.js";

describe("OsPath", () => {
  it("detects windows paths via drive letter", () => {
    const path = new OsPath("C:\\Torrents\\foo");
    expect(path.getKind()).toBe(OsPathKind.Windows);
    expect(path.isWindowsPath).toBe(true);
    expect(path.isRooted).toBe(true);
  });

  it("detects unix paths via leading slash", () => {
    const path = new OsPath("/mnt/downloads/foo");
    expect(path.getKind()).toBe(OsPathKind.Unix);
    expect(path.isUnixPath).toBe(true);
    expect(path.isRooted).toBe(true);
  });

  it("empty path reports isEmpty", () => {
    expect(OsPath.empty().isEmpty).toBe(true);
    expect(new OsPath("").isEmpty).toBe(true);
  });

  it("fileName returns the last path segment", () => {
    expect(new OsPath("C:\\Torrents\\foo\\bar.mkv").fileName).toBe("bar.mkv");
    expect(new OsPath("/mnt/downloads/bar.mkv").fileName).toBe("bar.mkv");
  });

  it("directory strips the last path segment", () => {
    const dir = new OsPath("C:\\Torrents\\foo\\bar.mkv").directory;
    expect(dir.fullPath).toBe("C:\\Torrents\\foo\\");
  });

  it("combine joins two rooted-vs-relative paths", () => {
    const base = new OsPath("C:\\Torrents");
    const combined = base.combine(new OsPath("subfolder"));
    expect(combined.fullPath).toBe("C:\\Torrents\\subfolder");
  });

  it("combine returns the right side unchanged when it is rooted", () => {
    const base = new OsPath("C:\\Torrents");
    const right = new OsPath("D:\\Other");
    expect(base.combine(right).fullPath).toBe("D:\\Other");
  });

  it("combine throws when combining across incompatible platforms", () => {
    const windows = new OsPath("C:\\Torrents");
    const unix = new OsPath("/mnt/unix", OsPathKind.Unix);
    expect(() => windows.combine(unix)).toThrow();
  });

  it("subtract computes the relative path between two rooted paths", () => {
    const parent = new OsPath("C:\\Torrents\\");
    const child = new OsPath("C:\\Torrents\\Show\\Season 1");
    const relative = child.subtract(parent);
    expect(relative.fullPath).toBe("Show\\Season 1");
  });

  it("contains detects ancestor/descendant relationships case-insensitively on windows", () => {
    const parent = new OsPath("C:\\Torrents");
    const child = new OsPath("c:\\torrents\\show");
    expect(parent.contains(child)).toBe(true);
    expect(child.contains(parent)).toBe(false);
  });

  it("asDirectory appends a trailing separator", () => {
    expect(new OsPath("C:\\Torrents").asDirectory().fullPath).toBe("C:\\Torrents\\");
    expect(new OsPath("/mnt/downloads").asDirectory().fullPath).toBe("/mnt/downloads/");
  });

  it("equals compares case-insensitively on windows paths", () => {
    expect(new OsPath("C:\\Torrents").equals(new OsPath("c:\\torrents"))).toBe(true);
  });

  it("collapses duplicate slashes on unix paths", () => {
    expect(new OsPath("/mnt//downloads///foo").fullPath).toBe("/mnt/downloads/foo");
  });
});

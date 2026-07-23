import { describe, expect, it } from "vitest";
import { exceptByPath, exceptPaths, getRelativePath, intersectByPath } from "../pathHelpers.js";

describe("getRelativePath", () => {
  it("returns the child path relative to the parent, trimming separators", () => {
    expect(getRelativePath("/books/author", "/books/author/book/file.epub")).toBe("book/file.epub");
  });

  it("returns an empty string when childPath equals parentPath", () => {
    expect(getRelativePath("/books/author", "/books/author")).toBe("");
  });

  it("throws when childPath is not under parentPath", () => {
    expect(() => getRelativePath("/books/author", "/other/path/file.epub")).toThrow();
  });

  it("does not treat a sibling with a shared prefix as a child", () => {
    expect(() => getRelativePath("/books/author", "/books/author2/file.epub")).toThrow();
  });
});

describe("intersectByPath", () => {
  it("returns items whose key path-equals an entry in keys", () => {
    const items = [{ relativePath: "cover.jpg" }, { relativePath: "book.opf" }];
    const result = intersectByPath(
      items,
      ["/books/author/cover.jpg"],
      (i) => `/books/author/${i.relativePath}`
    );

    expect(result).toEqual([{ relativePath: "cover.jpg" }]);
  });

  it("returns an empty array when nothing matches", () => {
    const items = [{ relativePath: "cover.jpg" }];
    const result = intersectByPath(items, ["/unrelated"], (i) => i.relativePath);

    expect(result).toEqual([]);
  });
});

describe("exceptByPath", () => {
  it("excludes items whose key path-equals an entry in keys", () => {
    const items = [{ relativePath: "cover.jpg" }, { relativePath: "book.opf" }];
    const result = exceptByPath(
      items,
      ["/books/author/cover.jpg"],
      (i) => `/books/author/${i.relativePath}`
    );

    expect(result).toEqual([{ relativePath: "book.opf" }]);
  });
});

describe("exceptPaths", () => {
  it("excludes plain string paths that path-equal an entry in keys", () => {
    const result = exceptPaths(["/a/1.jpg", "/a/2.jpg"], ["/a/1.jpg"]);
    expect(result).toEqual(["/a/2.jpg"]);
  });
});

import { describe, expect, it } from "vitest";
import { bookFileToString, getSceneOrFileName, newBookFile } from "../bookFile.js";
import { newBookFileMoveResult } from "../bookFileMoveResult.js";

describe("BookFile", () => {
  it("bookFileToString formats as [{id}] {path}", () => {
    const bookFile = { ...newBookFile(), id: 5, path: "/music/author/book.flac" };
    expect(bookFileToString(bookFile)).toBe("[5] /music/author/book.flac");
  });

  it("getSceneOrFileName prefers sceneName when present", () => {
    const bookFile = { ...newBookFile(), sceneName: "Scene.Name-GROUP", path: "/music/x.flac" };
    expect(getSceneOrFileName(bookFile)).toBe("Scene.Name-GROUP");
  });

  it("getSceneOrFileName falls back to the file name (without extension) from path", () => {
    const bookFile = { ...newBookFile(), sceneName: null, path: "/music/author/My Book.flac" };
    expect(getSceneOrFileName(bookFile)).toBe("My Book");
  });

  it("getSceneOrFileName falls back to the file name for a blank/whitespace sceneName", () => {
    const bookFile = { ...newBookFile(), sceneName: "   ", path: "/music/author/My Book.mp3" };
    expect(getSceneOrFileName(bookFile)).toBe("My Book");
  });

  it("getSceneOrFileName returns empty string when both sceneName and path are blank", () => {
    const bookFile = { ...newBookFile(), sceneName: null, path: "" };
    expect(getSceneOrFileName(bookFile)).toBe("");
  });
});

describe("BookFileMoveResult", () => {
  it("newBookFileMoveResult defaults oldFiles to an empty list", () => {
    const bookFile = newBookFile();
    const result = newBookFileMoveResult({ ...bookFile, id: 1 });
    expect(result.oldFiles).toEqual([]);
    expect(result.bookFile.id).toBe(1);
  });

  it("newBookFileMoveResult accepts explicit oldFiles", () => {
    const bookFile = { ...newBookFile(), id: 2 };
    const old = { ...newBookFile(), id: 1 };
    const result = newBookFileMoveResult(bookFile, [old]);
    expect(result.oldFiles).toEqual([old]);
  });
});

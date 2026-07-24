import { describe, expect, it } from "vitest";
import {
  authorStatisticsToResource,
  newAuthorStatisticsResource,
  percentOfBooks,
} from "../AuthorStatisticsResource.js";

describe("percentOfBooks", () => {
  it("is 0 when bookCount is 0 (avoids divide-by-zero)", () => {
    expect(percentOfBooks(0, 0)).toBe(0);
  });

  it("computes availableBookCount / bookCount * 100", () => {
    expect(percentOfBooks(4, 2)).toBe(50);
    expect(percentOfBooks(3, 3)).toBe(100);
  });
});

describe("authorStatisticsToResource", () => {
  it("returns null for a null/undefined model", () => {
    expect(authorStatisticsToResource(null)).toBeNull();
    expect(authorStatisticsToResource(undefined)).toBeNull();
  });

  it("maps fields and computes percentOfBooks", () => {
    const resource = authorStatisticsToResource({
      authorId: 1,
      bookFileCount: 3,
      bookCount: 4,
      availableBookCount: 2,
      totalBookCount: 5,
      sizeOnDisk: 1000,
      bookStatistics: [],
    });

    expect(resource).toEqual({
      bookFileCount: 3,
      bookCount: 4,
      availableBookCount: 2,
      totalBookCount: 5,
      sizeOnDisk: 1000,
      percentOfBooks: 50,
    });
  });
});

describe("newAuthorStatisticsResource", () => {
  it("defaults every field to 0", () => {
    expect(newAuthorStatisticsResource()).toEqual({
      bookFileCount: 0,
      bookCount: 0,
      availableBookCount: 0,
      totalBookCount: 0,
      sizeOnDisk: 0,
      percentOfBooks: 0,
    });
  });
});

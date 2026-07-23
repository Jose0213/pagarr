import { describe, expect, it } from "vitest";
import {
  isNotAncestorOfExistingAuthor,
  isNewAuthor,
  isNotAnotherAuthorsPath,
} from "../../paths/authorPathValidators.js";
import type { Author } from "../../../books/models.js";

/**
 * Translated behavior tests for AuthorAncestorValidator/AuthorExistsValidator/
 * AuthorPathValidator. No direct C# fixtures exist for these three
 * (exercised indirectly through AddAuthorValidator/AuthorService fixtures
 * in the real test suite).
 */

function fakeAuthorPaths(entries: Array<[number, string]>) {
  return { allAuthorPaths: () => new Map(entries) };
}

describe("isNotAncestorOfExistingAuthor", () => {
  it("is valid when the path is null/undefined", () => {
    const service = fakeAuthorPaths([[1, "/books/author-a"]]);
    expect(isNotAncestorOfExistingAuthor(service, null)).toBe(true);
    expect(isNotAncestorOfExistingAuthor(service, undefined)).toBe(true);
  });

  it("is invalid when the candidate path is an ancestor of an existing author's path", () => {
    const service = fakeAuthorPaths([[1, "/books/author-a"]]);
    expect(isNotAncestorOfExistingAuthor(service, "/books")).toBe(false);
  });

  it("is valid when unrelated to any existing author path", () => {
    const service = fakeAuthorPaths([[1, "/books/author-a"]]);
    expect(isNotAncestorOfExistingAuthor(service, "/audiobooks")).toBe(true);
  });
});

describe("isNewAuthor", () => {
  it("is valid when the foreign author id is null/undefined", () => {
    const service = { findById: (_id: string): Author | undefined => undefined };
    expect(isNewAuthor(service, null)).toBe(true);
    expect(isNewAuthor(service, undefined)).toBe(true);
  });

  it("is invalid (already added) when findById returns a match", () => {
    const author = { id: 1 } as Author;
    const service = { findById: (_id: string) => author };
    expect(isNewAuthor(service, "some-foreign-id")).toBe(false);
  });

  it("is valid (new) when findById returns nothing", () => {
    const service = { findById: (_id: string): Author | undefined => undefined };
    expect(isNewAuthor(service, "some-foreign-id")).toBe(true);
  });
});

describe("isNotAnotherAuthorsPath", () => {
  it("is valid when the path is null/undefined", () => {
    const service = fakeAuthorPaths([[1, "/books/author-a"]]);
    expect(isNotAnotherAuthorsPath(service, null, 2)).toBe(true);
  });

  it("is valid when the path-equal entry belongs to the same author instance", () => {
    const service = fakeAuthorPaths([[1, "/books/author-a"]]);
    expect(isNotAnotherAuthorsPath(service, "/books/author-a", 1)).toBe(true);
  });

  it("is invalid when the path-equal entry belongs to a DIFFERENT author", () => {
    const service = fakeAuthorPaths([[1, "/books/author-a"]]);
    expect(isNotAnotherAuthorsPath(service, "/books/author-a", 2)).toBe(false);
  });

  it("is valid when no author has that path", () => {
    const service = fakeAuthorPaths([[1, "/books/author-a"]]);
    expect(isNotAnotherAuthorsPath(service, "/books/author-b", 2)).toBe(true);
  });
});

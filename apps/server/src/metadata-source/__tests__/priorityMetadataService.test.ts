import { describe, expect, it, vi } from "vitest";
import { PriorityMetadataService, type ProviderFailure } from "../priorityMetadataService.js";
import {
  AuthorNotFoundException,
  BookNotFoundException,
  MetadataProviderException,
} from "../errors.js";
import type { Author, Book } from "../../books/models.js";
import { newAuthor, newBook } from "../../books/models.js";
import type { BookInfoResult, MetadataProvider, NewEntitySearchResult } from "../interfaces.js";

/** A minimal, fully-controllable fake provider for exercising fallback behavior. */
function fakeProvider(name: string, overrides: Partial<MetadataProvider> = {}): MetadataProvider {
  return {
    name,
    getAuthorInfo: vi.fn(async () => {
      throw new AuthorNotFoundException("unset");
    }),
    getChangedAuthors: vi.fn(async () => null),
    getBookInfo: vi.fn(async () => {
      throw new BookNotFoundException("unset");
    }),
    searchForNewAuthor: vi.fn(async () => [] as Author[]),
    searchForNewBook: vi.fn(async () => [] as Book[]),
    searchByIsbn: vi.fn(async () => [] as Book[]),
    searchByAsin: vi.fn(async () => [] as Book[]),
    searchByForeignEditionId: vi.fn(async () => [] as Book[]),
    searchForNewEntity: vi.fn(async () => [] as NewEntitySearchResult[]),
    ...overrides,
  };
}

function bookResult(title: string): BookInfoResult {
  return { foreignAuthorId: "a1", book: { ...newBook(), title }, authorMetadata: [] };
}

describe("PriorityMetadataService", () => {
  it("throws immediately if constructed with zero providers", () => {
    expect(() => new PriorityMetadataService([])).toThrow(/at least one provider/);
  });

  it("returns the first provider's result without touching the others when it succeeds", async () => {
    const primary = fakeProvider("primary", {
      getBookInfo: vi.fn(async () => bookResult("Primary's Book")),
    });
    const secondary = fakeProvider("secondary");

    const service = new PriorityMetadataService([primary, secondary]);
    const result = await service.getBookInfo("id-1");

    expect(result.book.title).toBe("Primary's Book");
    expect(secondary.getBookInfo).not.toHaveBeenCalled();
  });

  it("falls through to the next provider when the first throws (the actual fix for known-issue #1)", async () => {
    const primary = fakeProvider("primary", {
      getBookInfo: vi.fn(async () => {
        throw new MetadataProviderException("primary", "primary is rate-limited");
      }),
    });
    const secondary = fakeProvider("secondary", {
      getBookInfo: vi.fn(async () => bookResult("Secondary's Book")),
    });

    const service = new PriorityMetadataService([primary, secondary]);
    const result = await service.getBookInfo("id-1");

    expect(result.book.title).toBe("Secondary's Book");
    expect(primary.getBookInfo).toHaveBeenCalledTimes(1);
    expect(secondary.getBookInfo).toHaveBeenCalledTimes(1);
  });

  it("falls through across three providers, trying each in order until one succeeds", async () => {
    const calls: string[] = [];
    const failing = (name: string) =>
      fakeProvider(name, {
        getAuthorInfo: vi.fn(async () => {
          calls.push(name);
          throw new AuthorNotFoundException("x");
        }),
      });
    const third = fakeProvider("third", {
      getAuthorInfo: vi.fn(async () => {
        calls.push("third");
        return { ...newAuthor(), cleanName: "found" };
      }),
    });

    const service = new PriorityMetadataService([failing("first"), failing("second"), third]);
    const author = await service.getAuthorInfo("id-1");

    expect(author.cleanName).toBe("found");
    expect(calls).toEqual(["first", "second", "third"]);
  });

  it("re-throws the LAST provider's error when every provider fails", async () => {
    const firstError = new MetadataProviderException("first", "first failed");
    const lastError = new MetadataProviderException("last", "last failed, most relevant");

    const service = new PriorityMetadataService([
      fakeProvider("first", {
        getBookInfo: vi.fn(async () => {
          throw firstError;
        }),
      }),
      fakeProvider("last", {
        getBookInfo: vi.fn(async () => {
          throw lastError;
        }),
      }),
    ]);

    await expect(service.getBookInfo("id-1")).rejects.toBe(lastError);
  });

  it("invokes onProviderFailure once per failing provider, in order, before re-throwing", async () => {
    const failures: ProviderFailure[] = [];
    const service = new PriorityMetadataService(
      [
        fakeProvider("a", {
          getBookInfo: vi.fn(async () => {
            throw new Error("a broke");
          }),
        }),
        fakeProvider("b", {
          getBookInfo: vi.fn(async () => {
            throw new Error("b broke");
          }),
        }),
      ],
      { onProviderFailure: (f) => failures.push(f) }
    );

    await expect(service.getBookInfo("id-1")).rejects.toThrow("b broke");

    expect(failures).toHaveLength(2);
    expect(failures[0]!.provider).toBe("a");
    expect(failures[0]!.method).toBe("getBookInfo");
    expect(failures[1]!.provider).toBe("b");
  });

  it("does NOT fail over on an empty (but successful) search result -- empty is a legitimate answer, not a failure", async () => {
    const primary = fakeProvider("primary", {
      searchForNewBook: vi.fn(async () => [] as Book[]),
    });
    const secondary = fakeProvider("secondary", {
      searchForNewBook: vi.fn(async () => [{ ...newBook(), title: "Should not be reached" }]),
    });

    const service = new PriorityMetadataService([primary, secondary]);
    const results = await service.searchForNewBook("nonexistent title", null);

    expect(results).toEqual([]);
    expect(secondary.searchForNewBook).not.toHaveBeenCalled();
  });

  it("getChangedAuthors delegates only to the first provider (no fallback semantics)", async () => {
    const primary = fakeProvider("primary", {
      getChangedAuthors: vi.fn(async () => new Set(["x"])),
    });
    const secondary = fakeProvider("secondary", {
      getChangedAuthors: vi.fn(async () => new Set(["y"])),
    });

    const service = new PriorityMetadataService([primary, secondary]);
    const result = await service.getChangedAuthors(new Date());

    expect(result).toEqual(new Set(["x"]));
    expect(secondary.getChangedAuthors).not.toHaveBeenCalled();
  });

  it("passes through searchByForeignEditionId's getAllEditions parameter to whichever provider succeeds", async () => {
    const primary = fakeProvider("primary", {
      searchByForeignEditionId: vi.fn(async () => {
        throw new MetadataProviderException("primary", "down");
      }),
    });
    const secondary = fakeProvider("secondary", {
      searchByForeignEditionId: vi.fn(async (_id: string, getAllEditions: boolean) => [
        { ...newBook(), title: getAllEditions ? "all" : "one" },
      ]),
    });

    const service = new PriorityMetadataService([primary, secondary]);
    const [book] = await service.searchByForeignEditionId("e1", false);

    expect(book!.title).toBe("one");
  });
});

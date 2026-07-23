import { describe, expect, it } from "vitest";
import { OpenLibraryProvider } from "../open-library/provider.js";
import {
  idFromKey,
  parsePublishDate,
  toWorkResourceDto,
  coverUrl,
} from "../open-library/mapper.js";
import { AuthorNotFoundException, BookNotFoundException } from "../errors.js";
import { fakeHttpClient } from "./testHttpClient.js";
import type {
  OpenLibraryAuthor,
  OpenLibraryEdition,
  OpenLibraryWork,
} from "../open-library/types.js";

// Fixtures shaped per live openlibrary.org/works/OL27448W.json,
// /authors/OL34184A.json, and /works/OL27448W/editions.json responses
// (fetched July 2026 -- see this module's field-name verification notes).
function workFixture(overrides: Partial<OpenLibraryWork> = {}): OpenLibraryWork {
  return {
    key: "/works/OL27448W",
    title: "The Lord of the Rings",
    description: { type: "/type/text", value: "The Lord of the Rings is an epic..." },
    subjects: ["Fantasy fiction", "Middle-earth (Imaginary place)"],
    covers: [258027],
    first_publish_date: "1954",
    authors: [{ author: { key: "/authors/OL26320A" } }],
    ...overrides,
  };
}

function editionFixture(overrides: Partial<OpenLibraryEdition> = {}): OpenLibraryEdition {
  return {
    key: "/books/OL7353617M",
    title: "The Lord of the Rings",
    isbn_10: ["0261102354"],
    isbn_13: ["9780261102354"],
    publishers: ["HarperCollins"],
    publish_date: "1995",
    number_of_pages: 1216,
    physical_format: "Paperback",
    languages: [{ key: "/languages/eng" }],
    covers: [258027],
    ...overrides,
  };
}

function authorFixture(overrides: Partial<OpenLibraryAuthor> = {}): OpenLibraryAuthor {
  return {
    key: "/authors/OL26320A",
    name: "J.R.R. Tolkien",
    bio: { type: "/type/text", value: "John Ronald Reuel Tolkien was an English writer." },
    birth_date: "3 January 1892",
    death_date: "2 September 1973",
    photos: [5327864],
    ...overrides,
  };
}

describe("open-library/mapper", () => {
  it("idFromKey extracts the trailing id segment from an OpenLibrary key path", () => {
    expect(idFromKey("/works/OL27448W")).toBe("OL27448W");
    expect(idFromKey("/authors/OL26320A")).toBe("OL26320A");
    expect(idFromKey("OL27448W")).toBe("OL27448W");
  });

  it("coverUrl builds a covers.openlibrary.org URL", () => {
    expect(coverUrl(258027)).toBe("https://covers.openlibrary.org/b/id/258027-L.jpg");
    expect(coverUrl(258027, "M")).toBe("https://covers.openlibrary.org/b/id/258027-M.jpg");
  });

  describe("parsePublishDate", () => {
    it("passes through an already-ISO date", () => {
      expect(parsePublishDate("2017-11-14")).toBe("2017-11-14");
    });

    it("normalizes a bare year to January 1st of that year", () => {
      expect(parsePublishDate("1954")).toBe("1954-01-01");
    });

    it("parses a freeform date string via Date, falling back gracefully", () => {
      expect(parsePublishDate("March 1, 1994")).toBe("1994-03-01");
    });

    it("returns null for unparseable input", () => {
      expect(parsePublishDate("not a date at all !!")).toBeNull();
    });

    it("returns null for undefined", () => {
      expect(parsePublishDate(undefined)).toBeNull();
    });
  });

  it("toWorkResourceDto maps a work + editions + authors fixture into the common shape", () => {
    const dto = toWorkResourceDto(workFixture(), [editionFixture()], [authorFixture()]);

    expect(dto.foreignId).toBe("OL27448W");
    expect(dto.title).toBe("The Lord of the Rings");
    expect(dto.releaseDate).toBe("1954-01-01");
    expect(dto.genres).toEqual(["Fantasy fiction", "Middle-earth (Imaginary place)"]);
    expect(dto.books).toHaveLength(1);
    expect(dto.books[0]!.isbn13).toBe("9780261102354");
    expect(dto.books[0]!.publisher).toBe("HarperCollins");
    expect(dto.books[0]!.contributors).toEqual([{ foreignId: "OL26320A", role: "Author" }]);
    expect(dto.authors[0]!.name).toBe("J.R.R. Tolkien");
    expect(dto.authors[0]!.imageUrl).toBe("https://covers.openlibrary.org/b/id/5327864-L.jpg");
  });
});

describe("OpenLibraryProvider", () => {
  it("getBookInfo fetches work + editions + authors and maps them", async () => {
    const http = fakeHttpClient([
      { body: workFixture() },
      { body: { entries: [editionFixture()] } },
      { body: authorFixture() },
    ]);
    const provider = new OpenLibraryProvider(http);

    const result = await provider.getBookInfo("OL27448W");

    expect(result.book.title).toBe("The Lord of the Rings");
    expect(result.foreignAuthorId).toBe("OL26320A");
    expect(result.authorMetadata[0]!.name).toBe("J.R.R. Tolkien");
  });

  it("getBookInfo throws BookNotFoundException on a 404", async () => {
    const http = fakeHttpClient([{ status: 404, body: { error: "not found" } }]);
    const provider = new OpenLibraryProvider(http);

    await expect(provider.getBookInfo("OL_MISSING")).rejects.toThrow(BookNotFoundException);
  });

  it("getBookInfo still returns a result when the editions fetch fails (degrades to zero editions)", async () => {
    const http = fakeHttpClient([
      { body: workFixture() },
      { status: 404, body: {} },
      { body: authorFixture() },
    ]);
    const provider = new OpenLibraryProvider(http);

    const result = await provider.getBookInfo("OL27448W");
    expect(result.book.editions).toEqual([]);
  });

  it("getAuthorInfo maps a bare author fetch (no bibliography, per OpenLibrary's API shape)", async () => {
    const http = fakeHttpClient([{ body: authorFixture() }]);
    const provider = new OpenLibraryProvider(http);

    const author = await provider.getAuthorInfo("OL26320A");
    expect(author.metadata!.name).toBe("J.R.R. Tolkien");
  });

  it("getAuthorInfo throws AuthorNotFoundException on failure", async () => {
    const http = fakeHttpClient([{ status: 404, body: {} }]);
    const provider = new OpenLibraryProvider(http);

    await expect(provider.getAuthorInfo("OL_MISSING")).rejects.toThrow(AuthorNotFoundException);
  });

  it("searchByAsin always returns an empty array (documented limitation, no request made)", async () => {
    const http = fakeHttpClient([]);
    const provider = new OpenLibraryProvider(http);

    expect(await provider.searchByAsin("B074PXNZFV")).toEqual([]);
    expect(http.requests).toHaveLength(0);
  });

  it("searchForNewBook with getAllEditions=false builds a Book straight from the search doc (no per-work fetch)", async () => {
    const http = fakeHttpClient([
      {
        body: {
          start: 0,
          num_found: 1,
          docs: [
            {
              key: "/works/OL27448W",
              title: "The Lord of the Rings",
              author_name: ["J.R.R. Tolkien"],
              author_key: ["OL26320A"],
              first_publish_year: 1954,
            },
          ],
        },
      },
    ]);
    const provider = new OpenLibraryProvider(http);

    const books = await provider.searchForNewBook("Lord of the Rings", null, false);

    expect(books).toHaveLength(1);
    expect(books[0]!.title).toBe("The Lord of the Rings");
    expect(books[0]!.authorMetadata!.name).toBe("J.R.R. Tolkien");
    // No follow-up work/editions/author fetches -- only the one search call.
    expect(http.requests).toHaveLength(1);
  });
});

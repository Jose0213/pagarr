import { describe, expect, it } from "vitest";
import { GoogleBooksProvider } from "../google-books/provider.js";
import { authorForeignId, stripHtml, toWorkResourceDto } from "../google-books/mapper.js";
import { AuthorNotFoundException, BookNotFoundException } from "../errors.js";
import { fakeHttpClient } from "./testHttpClient.js";
import type { GoogleBooksVolume } from "../google-books/types.js";

// Fixture shaped per developers.google.com/books/docs/v1/reference/volumes'
// documented Volume resource (verified July 2026).
function volumeFixture(overrides: Partial<GoogleBooksVolume> = {}): GoogleBooksVolume {
  return {
    id: "zyTCAlFPjgYC",
    volumeInfo: {
      title: "Flowers for Algernon",
      subtitle: undefined,
      authors: ["Daniel Keyes"],
      publisher: "Harcourt",
      publishedDate: "2005-09-26",
      description: "<p>A classic of <b>science fiction</b>.<br>Told through journal entries.</p>",
      industryIdentifiers: [
        { type: "ISBN_10", identifier: "0156030307" },
        { type: "ISBN_13", identifier: "9780156030304" },
      ],
      pageCount: 311,
      categories: ["Fiction"],
      averageRating: 4.2,
      ratingsCount: 850,
      imageLinks: {
        smallThumbnail: "http://books.google.com/small.jpg",
        thumbnail: "http://books.google.com/thumb.jpg",
      },
      language: "en",
      infoLink: "http://books.google.com/books?id=zyTCAlFPjgYC",
      canonicalVolumeLink: "https://books.google.com/books/about/Flowers_for_Algernon.html",
      printType: "BOOK",
    },
    saleInfo: { isEbook: true },
    ...overrides,
  };
}

describe("google-books/mapper", () => {
  it("stripHtml removes tags and converts <br> to newlines", () => {
    expect(stripHtml("<p>Hello <b>world</b><br>Line two</p>")).toBe("Hello world\nLine two");
    expect(stripHtml(null)).toBeNull();
  });

  it("authorForeignId is stable and collision-resistant enough for the same input", () => {
    expect(authorForeignId("Daniel Keyes")).toBe(authorForeignId("Daniel Keyes"));
    expect(authorForeignId("Daniel Keyes")).toBe("gb-author-daniel-keyes");
  });

  it("toWorkResourceDto maps a Volume into a one-edition WorkResourceDto", () => {
    const dto = toWorkResourceDto(volumeFixture());

    expect(dto.foreignId).toBe("zyTCAlFPjgYC");
    expect(dto.title).toBe("Flowers for Algernon");
    expect(dto.books).toHaveLength(1);
    expect(dto.books[0]!.isbn13).toBe("9780156030304");
    expect(dto.books[0]!.description).toBe(
      "A classic of science fiction.\nTold through journal entries."
    );
    expect(dto.books[0]!.isEbook).toBe(true);
    expect(dto.authors).toHaveLength(1);
    expect(dto.authors[0]!.name).toBe("Daniel Keyes");
  });

  it("prefers ISBN_13 over ISBN_10 when both are present", () => {
    const dto = toWorkResourceDto(volumeFixture());
    expect(dto.books[0]!.isbn13).toBe("9780156030304");
  });

  it("handles a volume with no industryIdentifiers", () => {
    const dto = toWorkResourceDto(
      volumeFixture({
        volumeInfo: { ...volumeFixture().volumeInfo, industryIdentifiers: undefined },
      })
    );
    expect(dto.books[0]!.isbn13).toBeNull();
  });
});

describe("GoogleBooksProvider", () => {
  it("getBookInfo maps a single volume lookup", async () => {
    const http = fakeHttpClient([{ body: volumeFixture() }]);
    const provider = new GoogleBooksProvider(http);

    const result = await provider.getBookInfo("zyTCAlFPjgYC");

    expect(result.book.title).toBe("Flowers for Algernon");
    expect(result.book.editions).toHaveLength(1);
    expect(result.foreignAuthorId).toBe(authorForeignId("Daniel Keyes"));
  });

  it("getBookInfo throws BookNotFoundException on a 404", async () => {
    const http = fakeHttpClient([{ status: 404, body: {} }]);
    const provider = new GoogleBooksProvider(http);

    await expect(provider.getBookInfo("missing")).rejects.toThrow(BookNotFoundException);
  });

  it("getAuthorInfo always throws AuthorNotFoundException (documented limitation, no request made)", async () => {
    const http = fakeHttpClient([]);
    const provider = new GoogleBooksProvider(http);

    await expect(provider.getAuthorInfo("gb-author-daniel-keyes")).rejects.toThrow(
      AuthorNotFoundException
    );
    expect(http.requests).toHaveLength(0);
  });

  it("searchForNewBook maps every item in the search response", async () => {
    const http = fakeHttpClient([{ body: { totalItems: 1, items: [volumeFixture()] } }]);
    const provider = new GoogleBooksProvider(http);

    const books = await provider.searchForNewBook("Flowers for Algernon", null);
    expect(books).toHaveLength(1);
    expect(books[0]!.title).toBe("Flowers for Algernon");
  });

  it("searchForNewBook returns an empty array when items is absent", async () => {
    const http = fakeHttpClient([{ body: { totalItems: 0 } }]);
    const provider = new GoogleBooksProvider(http);

    expect(await provider.searchForNewBook("nonexistent gibberish", null)).toEqual([]);
  });

  it("searchByIsbn queries isbn: and returns the first match", async () => {
    const http = fakeHttpClient([{ body: { totalItems: 1, items: [volumeFixture()] } }]);
    const provider = new GoogleBooksProvider(http);

    const [book] = await provider.searchByIsbn("9780156030304");
    expect(book!.title).toBe("Flowers for Algernon");

    const sent = http.requests[0]!;
    expect(sent.url.toString()).toContain("isbn%3A9780156030304");
  });

  it("throws a quota-flavored MetadataProviderException on HTTP 403", async () => {
    const http = fakeHttpClient([{ status: 403, body: {} }]);
    const provider = new GoogleBooksProvider(http);

    await expect(provider.searchByIsbn("0000000000000")).rejects.toThrow(/quota/i);
  });

  it("appends the api key as a query param when provided", async () => {
    const http = fakeHttpClient([{ body: { totalItems: 0 } }]);
    const provider = new GoogleBooksProvider(http, { apiKey: "test-key-123" });

    await provider.searchForNewBook("anything", null);

    expect(http.requests[0]!.url.toString()).toContain("key=test-key-123");
  });
});

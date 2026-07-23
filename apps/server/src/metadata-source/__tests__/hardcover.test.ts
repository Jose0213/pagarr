import { describe, expect, it } from "vitest";
import { HardcoverProvider } from "../hardcover/provider.js";
import { toWorkResourceDto, toAuthorResourceDto } from "../hardcover/mapper.js";
import { AuthorNotFoundException, BookNotFoundException } from "../errors.js";
import { fakeHttpClient } from "./testHttpClient.js";
import type { HardcoverBook, HardcoverAuthor } from "../hardcover/types.js";

// Fixture shaped per docs.hardcover.app's live schema reference (Books,
// Editions, Authors, Contributions, Series pages -- see hardcover/types.ts's
// module doc comment for sourcing).
function hardcoverBookFixture(overrides: Partial<HardcoverBook> = {}): HardcoverBook {
  return {
    id: 328491,
    title: "Oathbringer",
    subtitle: null,
    slug: "oathbringer",
    description: "The Alethi armies have won a fleeting victory...",
    release_date: "2017-11-14",
    release_year: 2017,
    pages: 1230,
    rating: 4.8,
    ratings_count: 12000,
    image: { url: "https://hardcover.app/covers/oathbringer.jpg" },
    links: null,
    contributions: [
      {
        contribution: "Author",
        author: {
          id: 80626,
          name: "Brandon Sanderson",
          bio: "American author of epic fantasy",
          slug: "brandon-sanderson",
          image: { url: "https://hardcover.app/authors/sanderson.jpg" },
          books_count: 50,
          born_date: "1975-12-19",
          born_year: 1975,
          death_date: null,
          links: null,
        },
      },
    ],
    editions: [
      {
        id: 21953653,
        title: "Oathbringer",
        subtitle: null,
        isbn_10: "0765326358",
        isbn_13: "9780765326355",
        asin: null,
        pages: 1230,
        release_date: "2017-11-14",
        edition_format: "hardcover",
        edition_information: null,
        physical_format: "Hardcover",
        language: { language: "English" },
        reading_format: { format: "Physical" },
        publisher: { name: "Tor" },
        image: { url: "https://hardcover.app/editions/oathbringer.jpg" },
        rating: 4.8,
        users_count: 12000,
      },
    ],
    book_series: [
      {
        position: 3,
        details: "3",
        series: {
          id: 42,
          name: "The Stormlight Archive",
          slug: "the-stormlight-archive",
          description: "An epic fantasy series",
          books_count: 5,
          primary_books_count: 4,
          author: null,
        },
      },
    ],
    ...overrides,
  };
}

function authorFixture(overrides: Partial<HardcoverAuthor> = {}): HardcoverAuthor {
  return {
    id: 80626,
    name: "Brandon Sanderson",
    bio: "American author of epic fantasy",
    slug: "brandon-sanderson",
    image: { url: "https://hardcover.app/authors/sanderson.jpg" },
    books_count: 50,
    born_date: "1975-12-19",
    born_year: 1975,
    death_date: null,
    links: null,
    ...overrides,
  };
}

describe("hardcover/mapper", () => {
  it("toWorkResourceDto maps a Hardcover book fixture into the common WorkResourceDto shape", () => {
    const dto = toWorkResourceDto(hardcoverBookFixture());

    expect(dto.foreignId).toBe("328491");
    expect(dto.title).toBe("Oathbringer");
    expect(dto.url).toBe("https://hardcover.app/books/oathbringer");
    expect(dto.releaseDate).toBe("2017-11-14");
    expect(dto.books).toHaveLength(1);
    expect(dto.books[0]!.isbn13).toBe("9780765326355");
    expect(dto.books[0]!.publisher).toBe("Tor");
    expect(dto.books[0]!.contributors).toEqual([{ foreignId: "80626", role: "Author" }]);
    expect(dto.series).toHaveLength(1);
    expect(dto.series[0]!.title).toBe("The Stormlight Archive");
    expect(dto.series[0]!.linkItems[0]).toEqual({
      foreignWorkId: "328491",
      positionInSeries: "3",
      seriesPosition: 3,
      primary: true,
    });
    expect(dto.authors).toHaveLength(1);
    expect(dto.authors[0]!.foreignId).toBe("80626");
  });

  it("toEditionResourceDto detects ebook format from reading_format", () => {
    const book = hardcoverBookFixture({
      editions: [
        {
          id: 1,
          title: "Oathbringer",
          subtitle: null,
          isbn_10: null,
          isbn_13: null,
          asin: "B074PXNZFV",
          pages: 1230,
          release_date: "2017-11-14",
          edition_format: "ebook",
          edition_information: null,
          physical_format: null,
          language: null,
          reading_format: { format: "Ebook" },
          publisher: null,
          image: null,
          rating: null,
          users_count: 0,
        },
      ],
    });

    const dto = toWorkResourceDto(book);
    expect(dto.books[0]!.isEbook).toBe(true);
    expect(dto.books[0]!.asin).toBe("B074PXNZFV");
  });

  it("toAuthorResourceDto maps author fields and builds the hardcover.app URL from slug", () => {
    const dto = toAuthorResourceDto(authorFixture());
    expect(dto.foreignId).toBe("80626");
    expect(dto.url).toBe("https://hardcover.app/authors/brandon-sanderson");
    expect(dto.imageUrl).toBe("https://hardcover.app/authors/sanderson.jpg");
  });
});

describe("HardcoverProvider", () => {
  it("getBookInfo maps a GraphQL books response into a BookInfoResult", async () => {
    const http = fakeHttpClient([{ body: { data: { books: [hardcoverBookFixture()] } } }]);
    const provider = new HardcoverProvider(http, { apiToken: "test-token" });

    const result = await provider.getBookInfo("328491");

    expect(result.book.title).toBe("Oathbringer");
    expect(result.book.foreignBookId).toBe("328491");
    expect(result.foreignAuthorId).toBe("80626");
    expect(result.authorMetadata).toHaveLength(1);
    expect(result.authorMetadata[0]!.name).toBe("Brandon Sanderson");

    // Sends the authorization header verbatim (not "Bearer <token>" split
    // across a different header name) -- see hardcover/client.ts's doc
    // comment on this being a deliberate deviation from the usual
    // Authorization: Bearer convention.
    const sentRequest = http.requests[0]!;
    expect(sentRequest.headers.get("authorization")).toBe("test-token");
  });

  it("getBookInfo throws BookNotFoundException when Hardcover returns no matching book", async () => {
    const http = fakeHttpClient([{ body: { data: { books: [] } } }]);
    const provider = new HardcoverProvider(http, { apiToken: "test-token" });

    await expect(provider.getBookInfo("999999")).rejects.toThrow(BookNotFoundException);
  });

  it("getBookInfo throws BookNotFoundException immediately for a non-numeric id (no request made)", async () => {
    const http = fakeHttpClient([]);
    const provider = new HardcoverProvider(http, { apiToken: "test-token" });

    await expect(provider.getBookInfo("not-a-number")).rejects.toThrow(BookNotFoundException);
    expect(http.requests).toHaveLength(0);
  });

  it("getAuthorInfo maps author + filtered works into an Author", async () => {
    const ownBook = hardcoverBookFixture({
      id: 1,
      contributions: [{ contribution: "Author", author: authorFixture() }],
    });
    const http = fakeHttpClient([
      {
        body: {
          data: {
            authors: [
              {
                ...authorFixture(),
                contributions: [{ book: ownBook }],
              },
            ],
          },
        },
      },
    ]);
    const provider = new HardcoverProvider(http, { apiToken: "test-token" });

    const author = await provider.getAuthorInfo("80626");

    expect(author.metadata!.foreignAuthorId).toBe("80626");
    expect(author.books).toHaveLength(1);
  });

  it("getAuthorInfo throws AuthorNotFoundException when no author matches", async () => {
    const http = fakeHttpClient([{ body: { data: { authors: [] } } }]);
    const provider = new HardcoverProvider(http, { apiToken: "test-token" });

    await expect(provider.getAuthorInfo("1")).rejects.toThrow(AuthorNotFoundException);
  });

  it("throws MetadataProviderException on a GraphQL errors[] response", async () => {
    const http = fakeHttpClient([
      { body: { errors: [{ message: "Query depth limit exceeded" }] } },
    ]);
    const provider = new HardcoverProvider(http, { apiToken: "test-token" });

    await expect(provider.getBookInfo("1")).rejects.toThrow(/Query depth limit exceeded/);
  });

  it("throws a rate-limit-flavored error on HTTP 429", async () => {
    const http = fakeHttpClient([{ status: 429, body: { error: "Throttled" } }]);
    const provider = new HardcoverProvider(http, { apiToken: "test-token" });

    await expect(provider.getBookInfo("1")).rejects.toThrow(/rate limit/i);
  });

  it("searchByIsbn resolves an edition then maps its parent book", async () => {
    const http = fakeHttpClient([
      { body: { data: { editions: [{ id: 21953653, book: hardcoverBookFixture() }] } } },
    ]);
    const provider = new HardcoverProvider(http, { apiToken: "test-token" });

    const [book] = await provider.searchByIsbn("9780765326355");

    expect(book!.title).toBe("Oathbringer");
  });

  it("searchByIsbn returns an empty array when no edition matches", async () => {
    const http = fakeHttpClient([{ body: { data: { editions: [] } } }]);
    const provider = new HardcoverProvider(http, { apiToken: "test-token" });

    expect(await provider.searchByIsbn("0000000000000")).toEqual([]);
  });

  it("searchForNewBook searches Typesense then resolves each hit's full book", async () => {
    const http = fakeHttpClient([
      {
        body: {
          data: {
            search: { results: { hits: [{ document: { id: 328491, title: "Oathbringer" } }] } },
          },
        },
      },
      { body: { data: { books: [hardcoverBookFixture()] } } },
    ]);
    const provider = new HardcoverProvider(http, { apiToken: "test-token" });

    const books = await provider.searchForNewBook("Oathbringer", null);

    expect(books).toHaveLength(1);
    expect(books[0]!.title).toBe("Oathbringer");
  });

  it("searchForNewAuthor dedupes authors across search results", async () => {
    const http = fakeHttpClient([
      {
        body: {
          data: {
            search: {
              results: { hits: [{ document: { id: 1 } }, { document: { id: 2 } }] },
            },
          },
        },
      },
      { body: { data: { books: [hardcoverBookFixture({ id: 1 })] } } },
      { body: { data: { books: [hardcoverBookFixture({ id: 2 })] } } },
    ]);
    const provider = new HardcoverProvider(http, { apiToken: "test-token" });

    const authors = await provider.searchForNewAuthor("Sanderson");

    expect(authors).toHaveLength(1);
    expect(authors[0]!.metadata!.foreignAuthorId).toBe("80626");
  });
});

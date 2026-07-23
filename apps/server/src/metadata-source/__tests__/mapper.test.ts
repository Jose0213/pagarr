import { describe, expect, it } from "vitest";
import { NullTextMatcher } from "../../books/textMatching.js";
import {
  getPrimaryAuthorId,
  linkSeriesToBooks,
  mapAuthor,
  mapAuthorMetadata,
  mapBook,
  mapEdition,
  mapSeries,
} from "../mapper.js";
import type {
  AuthorResourceDto,
  BookResourceDto,
  SeriesResourceDto,
  WorkResourceDto,
} from "../dto.js";

function bookResource(overrides: Partial<BookResourceDto> = {}): BookResourceDto {
  return {
    foreignId: "b1",
    asin: null,
    description: "An edition description",
    isbn13: "9780547928227",
    title: "  Oathbringer  ",
    language: "eng",
    format: "hardcover",
    editionInformation: null,
    publisher: "Tor",
    imageUrl: "https://example.com/cover.jpg",
    isEbook: false,
    numPages: 1230,
    ratingCount: 100,
    averageRating: 4.5,
    url: "https://example.com/book/b1",
    releaseDate: "2017-11-14",
    contributors: [{ foreignId: "a1", role: "Author" }],
    ...overrides,
  };
}

function workResource(overrides: Partial<WorkResourceDto> = {}): WorkResourceDto {
  return {
    foreignId: "w1",
    title: "Oathbringer",
    url: "https://example.com/work/w1",
    releaseDate: null,
    genres: ["Fantasy", "Epic"],
    relatedWorks: [],
    books: [bookResource()],
    series: [],
    authors: [],
    ...overrides,
  };
}

function authorResource(overrides: Partial<AuthorResourceDto> = {}): AuthorResourceDto {
  return {
    foreignId: "a1",
    name: "Brandon   Sanderson",
    description: "An author bio",
    imageUrl: "https://example.com/author.jpg",
    url: "https://example.com/author/a1",
    ratingCount: 5000,
    averageRating: 4.7,
    ...overrides,
  };
}

describe("mapAuthorMetadata", () => {
  it("maps fields and cleans/lowercases name-derived fields", () => {
    const metadata = mapAuthorMetadata(authorResource(), "TestSource");

    expect(metadata.foreignAuthorId).toBe("a1");
    expect(metadata.titleSlug).toBe("a1");
    expect(metadata.name).toBe("Brandon Sanderson"); // cleanSpaces collapses the double space
    expect(metadata.sortName).toBe("brandon sanderson");
    expect(metadata.overview).toBe("An author bio");
    expect(metadata.ratings).toEqual({ votes: 5000, value: 4.7 });
    expect(metadata.images).toEqual([
      { url: "https://example.com/author.jpg", coverType: "poster" },
    ]);
    expect(metadata.links).toEqual([{ url: "https://example.com/author/a1", name: "TestSource" }]);
  });

  it("omits image/link when url fields are blank", () => {
    const metadata = mapAuthorMetadata(authorResource({ imageUrl: null, url: "" }), "TestSource");

    expect(metadata.images).toEqual([]);
    expect(metadata.links).toEqual([]);
  });
});

describe("mapSeries", () => {
  it("maps foreignId/title/description, defaulting numbered/workCount", () => {
    const dto: SeriesResourceDto = {
      foreignId: "s1",
      title: "The Stormlight Archive",
      description: "An epic fantasy series",
      linkItems: [],
    };

    const series = mapSeries(dto);

    expect(series.foreignSeriesId).toBe("s1");
    expect(series.title).toBe("The Stormlight Archive");
    expect(series.description).toBe("An epic fantasy series");
    expect(series.numbered).toBe(false);
    expect(series.workCount).toBe(0);
  });
});

describe("mapEdition", () => {
  it("maps every field faithfully, cleaning the title", () => {
    const edition = mapEdition(bookResource(), "TestSource");

    expect(edition.foreignEditionId).toBe("b1");
    expect(edition.isbn13).toBe("9780547928227");
    expect(edition.title).toBe("Oathbringer"); // cleanSpaces trims + collapses
    expect(edition.language).toBe("eng");
    expect(edition.publisher).toBe("Tor");
    expect(edition.pageCount).toBe(1230);
    expect(edition.releaseDate).toBe("2017-11-14");
    expect(edition.ratings).toEqual({ votes: 100, value: 4.5 });
    expect(edition.images).toEqual([{ url: "https://example.com/cover.jpg", coverType: "cover" }]);
    expect(edition.links).toEqual([
      { url: "https://example.com/book/b1", name: "TestSource Book" },
    ]);
    expect(edition.monitored).toBe(false); // mapEdition alone never sets monitored -- mapBook does
  });

  it("defaults numPages to 0 and overview to empty string when null", () => {
    const edition = mapEdition(bookResource({ numPages: null, description: null }), "TestSource");

    expect(edition.pageCount).toBe(0);
    expect(edition.overview).toBe("");
  });
});

describe("mapBook", () => {
  it("monitors exactly the most-popular edition by ratings popularity", () => {
    const popular = bookResource({ foreignId: "e-popular", ratingCount: 1000, averageRating: 4.9 });
    const lessPopular = bookResource({ foreignId: "e-less", ratingCount: 10, averageRating: 3.0 });

    const book = mapBook(workResource({ books: [lessPopular, popular] }), "TestSource");

    const monitoredEditions = book.editions!.filter((e) => e.monitored);
    expect(monitoredEditions).toHaveLength(1);
    expect(monitoredEditions[0]!.foreignEditionId).toBe("e-popular");
  });

  it("falls back to the monitored edition's title when the work title is blank", () => {
    const edition = bookResource({ title: "Edition Title" });
    const book = mapBook(workResource({ title: "   ", books: [edition] }), "TestSource");

    expect(book.title).toBe("Edition Title");
  });

  it("sums edition ratings weighted by votes", () => {
    const e1 = bookResource({ foreignId: "e1", ratingCount: 100, averageRating: 4.0 });
    const e2 = bookResource({ foreignId: "e2", ratingCount: 300, averageRating: 5.0 });

    const book = mapBook(workResource({ books: [e1, e2] }), "TestSource");

    expect(book.ratings.votes).toBe(400);
    // (100*4 + 300*5) / 400 = (400 + 1500) / 400 = 4.75
    expect(book.ratings.value).toBeCloseTo(4.75);
  });

  it("gives ratings {votes: 0, value: 0} when there are no editions with votes", () => {
    const book = mapBook(workResource({ books: [bookResource({ ratingCount: 0 })] }), "TestSource");
    expect(book.ratings).toEqual({ votes: 0, value: 0 });
  });

  it("falls back to the earliest non-Jan-1 edition release date when the work has none", () => {
    const jan1 = bookResource({ foreignId: "e-jan1", releaseDate: "2010-01-01" });
    const real = bookResource({ foreignId: "e-real", releaseDate: "2015-06-15" });

    const book = mapBook(workResource({ releaseDate: null, books: [jan1, real] }), "TestSource");

    expect(book.releaseDate).toBe("2015-06-15");
  });

  it("falls back to any dated edition (including Jan 1) if no non-Jan-1 dates exist", () => {
    const jan1 = bookResource({ foreignId: "e-jan1", releaseDate: "2010-01-01" });

    const book = mapBook(workResource({ releaseDate: null, books: [jan1] }), "TestSource");

    expect(book.releaseDate).toBe("2010-01-01");
  });

  it("sets anyEditionOk true and derives cleanTitle/titleSlug", () => {
    const book = mapBook(workResource(), "TestSource");

    expect(book.anyEditionOk).toBe(true);
    expect(book.titleSlug).toBe("w1");
    expect(book.cleanTitle).toBe("oathbringer");
  });

  it("parses relatedWorks ids as numbers, dropping non-numeric ones", () => {
    const book = mapBook(
      workResource({ relatedWorks: ["123", "not-a-number", "456"] }),
      "TestSource"
    );
    expect(book.relatedBooks).toEqual([123, 456]);
  });
});

describe("getPrimaryAuthorId", () => {
  it("picks the contributor of the edition with the highest ratingCount*averageRating", () => {
    const strong = bookResource({
      foreignId: "e-strong",
      ratingCount: 1000,
      averageRating: 5,
      contributors: [{ foreignId: "author-strong", role: "Author" }],
    });
    const weak = bookResource({
      foreignId: "e-weak",
      ratingCount: 1,
      averageRating: 1,
      contributors: [{ foreignId: "author-weak", role: "Author" }],
    });

    const id = getPrimaryAuthorId(workResource({ books: [weak, strong] }));

    expect(id).toBe("author-strong");
  });

  it("returns empty string when no edition has contributors", () => {
    const noContributors = bookResource({ contributors: [] });
    expect(getPrimaryAuthorId(workResource({ books: [noContributors] }))).toBe("");
  });
});

describe("mapAuthor", () => {
  it("maps metadata, filters works to ones this author primarily authored, and attaches authorMetadata", () => {
    const ownWork = workResource({
      foreignId: "w-own",
      books: [
        bookResource({ foreignId: "e-own", contributors: [{ foreignId: "a1", role: "Author" }] }),
      ],
    });
    const otherWork = workResource({
      foreignId: "w-other",
      books: [
        bookResource({ foreignId: "e-other", contributors: [{ foreignId: "a2", role: "Author" }] }),
      ],
    });

    const author = mapAuthor(
      authorResource({ foreignId: "a1", works: [ownWork, otherWork] }),
      new NullTextMatcher(),
      "TestSource"
    );

    expect(author.books).toHaveLength(1);
    expect(author.books![0]!.foreignBookId).toBe("w-own");
    expect(author.books![0]!.authorMetadata!.foreignAuthorId).toBe("a1");
    expect(author.metadata!.foreignAuthorId).toBe("a1");
  });

  it("links series to their books via linkSeriesToBooks", () => {
    const work = workResource({
      foreignId: "w1",
      books: [bookResource({ contributors: [{ foreignId: "a1", role: "Author" }] })],
    });
    const seriesResource: SeriesResourceDto = {
      foreignId: "s1",
      title: "A Series",
      description: null,
      linkItems: [{ foreignWorkId: "w1", positionInSeries: "1", seriesPosition: 1, primary: true }],
    };

    const author = mapAuthor(
      authorResource({ foreignId: "a1", works: [work], series: [seriesResource] }),
      new NullTextMatcher(),
      "TestSource"
    );

    expect(author.series).toHaveLength(1);
    expect(author.books![0]!.seriesLinks).toHaveLength(1);
    expect(author.books![0]!.seriesLinks![0]!.series!.foreignSeriesId).toBe("s1");
  });
});

describe("linkSeriesToBooks", () => {
  it("ignores series with no linkItems and links pointing at unknown books", () => {
    const book = { ...mapBook(workResource(), "TestSource") };
    const emptySeries: SeriesResourceDto = {
      foreignId: "s-empty",
      title: "Empty",
      description: null,
      linkItems: [],
    };
    const danglingSeries: SeriesResourceDto = {
      foreignId: "s-dangling",
      title: "Dangling",
      description: null,
      linkItems: [
        {
          foreignWorkId: "unknown-work",
          positionInSeries: null,
          seriesPosition: 0,
          primary: false,
        },
      ],
    };

    const series = [mapSeries(emptySeries), mapSeries(danglingSeries)];
    linkSeriesToBooks(series, [book], [emptySeries, danglingSeries]);

    expect(book.seriesLinks).toEqual([]);
  });
});

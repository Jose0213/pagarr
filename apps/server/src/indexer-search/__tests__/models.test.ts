import { describe, expect, it } from "vitest";
import { NullTextMatcher, type ITextMatcher } from "../../books/textMatching.js";
import { newAuthor, newAuthorMetadata, newBook, type Author } from "../../books/models.js";
import {
  authorQuery,
  bookQuery,
  describeAuthorSearchCriteria,
  describeBookSearchCriteria,
  describeSearchCriteria,
  getQueryTitle,
  removeAccent,
  type AuthorSearchCriteria,
  type BookSearchCriteria,
} from "../models.js";

// Translated from NzbDrone.Core.Test/IndexerSearchTests/SearchDefinitionFixture.cs
// (BookSearchDefinitionFixture -- the file name doesn't match the class name in the
// real source tree).

/**
 * A test-only reproduction of the real (forward-referenced, Parser-module)
 * `Parser.SplitBookTitle(this string book, string author)` -- see
 * models.ts's module doc comment on why `ITextMatcher.splitBookTitle` is a
 * forward reference in the first place. `bookQuery()` calls
 * `textMatcher.splitBookTitle(...)` before cleaning, and the real C#
 * `BookSearchDefinitionFixture` test cases (translated below) only make
 * sense against the real splitting behavior (e.g. "American III: Solitary
 * Man" -> "American III" relies on SplitBookTitle's colon-truncation, not
 * on GetQueryTitle's own cleaning). This mirrors the real algorithm closely
 * enough to reproduce those fixtures; it is NOT the production
 * implementation (that lands with the Parser module port).
 */
class SplitBookTitleTextMatcher implements ITextMatcher {
  cleanAuthorName(name: string): string {
    return name;
  }
  fuzzyMatch(): number {
    return 0;
  }
  fuzzyContains(): number {
    return 0;
  }
  removeBracketsAndContents(text: string): string {
    return text;
  }
  removeAfterDash(text: string): string {
    return text;
  }
  splitBookTitle(book: string, author: string): [string, string] {
    if (book.startsWith(`${author}:`)) {
      book = book.slice(book.indexOf(":") + 1).trim();
    }

    let parenthesis = book.indexOf("(");
    const colon = book.indexOf(":");

    if (parenthesis > -1) {
      const endParenthesis = book.indexOf(")", parenthesis);
      if (endParenthesis === -1 || !book.slice(parenthesis + 1, endParenthesis + 1).includes(" ")) {
        parenthesis = -1;
      }
    }

    let parts: [string, string] | null = null;

    if (colon > -1 && parenthesis > -1) {
      if (colon < parenthesis) {
        parts = [book.slice(0, colon), book.slice(colon + 1)];
      } else {
        const rest = book.slice(parenthesis + 1);
        parts = [book.slice(0, parenthesis), rest.replace(/\)+$/, "")];
      }
    } else if (colon > -1) {
      parts = [book.slice(0, colon), book.slice(colon + 1)];
    } else if (parenthesis > -1) {
      const rest = book.slice(parenthesis + 1);
      parts = [book.slice(0, parenthesis), rest.replace(/\)+$/, "")];
    }

    if (parts) {
      return [parts[0].trim(), parts[1].replace(/:+$/, "").trim()];
    }

    return [book, ""];
  }
}

function authorWithName(name: string): Author {
  return { ...newAuthor(), metadata: { ...newAuthorMetadata(), name } };
}

describe("getQueryTitle / authorQuery", () => {
  it.each([
    ["Mötley Crüe", "Motley+Crue"],
    ["방탄소년단", "방탄소년단"],
  ])("replaces special characters in author name: %s -> %s", (author, expected) => {
    const criteria: AuthorSearchCriteria = {
      monitoredBooksOnly: false,
      userInvokedSearch: false,
      interactiveSearch: false,
      author: authorWithName(author),
      books: [],
    };

    expect(authorQuery(criteria)).toBe(expected);
  });

  it("strips a leading 'The '", () => {
    expect(getQueryTitle("The Author")).toBe("Author");
  });

  it("replaces Various Authors with VA", () => {
    expect(getQueryTitle("Various Authors")).toBe("VA");
  });

  it("throws on blank input", () => {
    expect(() => getQueryTitle("")).toThrow();
    expect(() => getQueryTitle("   ")).toThrow();
  });
});

describe("bookQuery", () => {
  const matcher = new SplitBookTitleTextMatcher();

  function bookCriteria(bookTitle: string): BookSearchCriteria {
    return {
      monitoredBooksOnly: false,
      userInvokedSearch: false,
      interactiveSearch: false,
      author: authorWithName("Author"),
      books: [],
      bookTitle,
      bookYear: 0,
    };
  }

  it.each([
    ["…and Justice for All", "and+Justice+for+All"],
    ["American III: Solitary Man", "American+III"],
    ["Sad Clowns & Hillbillies", "Sad+Clowns+Hillbillies"],
    ["¿Quién sabe?", "Quien+sabe"],
    ["Seal the Deal & Let's Boogie", "Seal+the+Deal+Let's+Boogie"],
    ["Section.80", "Section+80"],
  ])("replaces special characters in book title: %s -> %s", (title, expected) => {
    expect(bookQuery(bookCriteria(title), matcher)).toBe(expected);
  });

  it("falls back to the raw title if cleaning produces an empty string", () => {
    expect(bookQuery(bookCriteria("+"), matcher)).toBe("+");
  });
});

describe("removeAccent", () => {
  it("strips combining diacritics while keeping base characters", () => {
    expect(removeAccent("Mötley Crüe")).toBe("Motley Crue");
    expect(removeAccent("¿Quién sabe?")).toBe("¿Quien sabe?");
  });

  it("leaves non-Latin scripts untouched", () => {
    expect(removeAccent("방탄소년단")).toBe("방탄소년단");
  });
});

describe("describeAuthorSearchCriteria / describeBookSearchCriteria / describeSearchCriteria", () => {
  it("formats an author search criteria as [Author Name]", () => {
    const criteria: AuthorSearchCriteria = {
      monitoredBooksOnly: false,
      userInvokedSearch: false,
      interactiveSearch: false,
      author: authorWithName("Stephen King"),
      books: [],
    };

    expect(describeAuthorSearchCriteria(criteria)).toBe("[Stephen King]");
    expect(describeSearchCriteria(criteria)).toBe("[Stephen King]");
  });

  it("formats a book search criteria as [Author Name - Book Title]", () => {
    const criteria: BookSearchCriteria = {
      monitoredBooksOnly: false,
      userInvokedSearch: false,
      interactiveSearch: false,
      author: authorWithName("Stephen King"),
      books: [newBook()],
      bookTitle: "It",
      bookYear: 1986,
    };

    expect(describeBookSearchCriteria(criteria)).toBe("[Stephen King - It]");
    expect(describeSearchCriteria(criteria)).toBe("[Stephen King - It]");
  });
});

describe("NullTextMatcher integration", () => {
  it("bookQuery works with the default NullTextMatcher (identity split)", () => {
    const criteria: BookSearchCriteria = {
      monitoredBooksOnly: false,
      userInvokedSearch: false,
      interactiveSearch: false,
      author: authorWithName("Author"),
      books: [],
      bookTitle: "Some Book",
      bookYear: 0,
    };

    expect(bookQuery(criteria, new NullTextMatcher())).toBe("Some+Book");
  });
});

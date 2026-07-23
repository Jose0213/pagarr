import { describe, expect, it } from "vitest";
import { SingleBookSearchMatchSpecification } from "../../../specifications/search/singleBookSearchMatchSpecification.js";
import type { AuthorSearchCriteria, BookSearchCriteria } from "../../../remoteBook.js";
import { makeAuthor, makeParsedBookInfo, makeRemoteBook } from "../../testFixtures.js";

/** No dedicated C# fixture exists for SingleBookSearchMatchSpecification -- new tests covering its documented behavior (ported from SingleBookSearchMatchSpecification.cs's own logic directly). */
describe("SingleBookSearchMatchSpecification", () => {
  const subject = new SingleBookSearchMatchSpecification();

  function bookSearchCriteria(): BookSearchCriteria {
    return {
      kind: "book",
      monitoredBooksOnly: false,
      userInvokedSearch: false,
      interactiveSearch: false,
      author: makeAuthor(),
      books: [],
      bookTitle: "",
      bookYear: 0,
    };
  }

  it("accepts when there is no search criteria", () => {
    const remoteBook = makeRemoteBook({ parsedBookInfo: makeParsedBookInfo({ bookTitle: "" }) });
    expect(subject.isSatisfiedBy(remoteBook, null).accepted).toBe(true);
  });

  it("accepts when the search criteria is not a book search (e.g. author search)", () => {
    const remoteBook = makeRemoteBook({ parsedBookInfo: makeParsedBookInfo({ bookTitle: "" }) });
    const authorCriteria: AuthorSearchCriteria = {
      kind: "author",
      monitoredBooksOnly: false,
      userInvokedSearch: false,
      interactiveSearch: false,
      author: makeAuthor(),
      books: [],
    };

    expect(subject.isSatisfiedBy(remoteBook, authorCriteria).accepted).toBe(true);
  });

  it("rejects a full-discography release (no parsed book title) during a single book search", () => {
    const remoteBook = makeRemoteBook({ parsedBookInfo: makeParsedBookInfo({ bookTitle: "" }) });
    expect(subject.isSatisfiedBy(remoteBook, bookSearchCriteria()).accepted).toBe(false);
  });

  it("accepts when a book title was parsed", () => {
    const remoteBook = makeRemoteBook({
      parsedBookInfo: makeParsedBookInfo({ bookTitle: "Some Book" }),
    });
    expect(subject.isSatisfiedBy(remoteBook, bookSearchCriteria()).accepted).toBe(true);
  });
});

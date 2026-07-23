import { describe, expect, it } from "vitest";
import { BookRequestedSpecification } from "../../../specifications/search/bookRequestedSpecification.js";
import type { BookSearchCriteria } from "../../../remoteBook.js";
import { makeAuthor, makeBook, makeRemoteBook } from "../../testFixtures.js";

/** No dedicated C# fixture exists for BookRequestedSpecification -- new tests covering its documented behavior. */
describe("BookRequestedSpecification", () => {
  const subject = new BookRequestedSpecification();

  function searchCriteriaWithBooks(books: ReturnType<typeof makeBook>[]): BookSearchCriteria {
    return {
      kind: "book",
      monitoredBooksOnly: false,
      userInvokedSearch: false,
      interactiveSearch: false,
      author: makeAuthor(),
      books,
      bookTitle: "",
      bookYear: 0,
    };
  }

  it("accepts when there is no search criteria", () => {
    const remoteBook = makeRemoteBook({ books: [makeBook({ id: 1 })] });
    expect(subject.isSatisfiedBy(remoteBook, null).accepted).toBe(true);
  });

  it("accepts when the remote book's book id intersects the requested set", () => {
    const remoteBook = makeRemoteBook({ books: [makeBook({ id: 1 })] });
    const criteria = searchCriteriaWithBooks([makeBook({ id: 1 }), makeBook({ id: 2 })]);

    expect(subject.isSatisfiedBy(remoteBook, criteria).accepted).toBe(true);
  });

  it("rejects when none of the remote book's books were requested", () => {
    const remoteBook = makeRemoteBook({ books: [makeBook({ id: 3 })] });
    const criteria = searchCriteriaWithBooks([makeBook({ id: 1 }), makeBook({ id: 2 })]);

    expect(subject.isSatisfiedBy(remoteBook, criteria).accepted).toBe(false);
  });
});

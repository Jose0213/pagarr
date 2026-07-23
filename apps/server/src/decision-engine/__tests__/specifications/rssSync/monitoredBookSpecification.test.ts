import { describe, expect, it } from "vitest";
import { MonitoredBookSpecification } from "../../../specifications/rssSync/monitoredBookSpecification.js";
import type { BookSearchCriteria } from "../../../remoteBook.js";
import { makeAuthor, makeBook, makeParsedBookInfo, makeRemoteBook } from "../../testFixtures.js";

/** Ported from NzbDrone.Core.Test/DecisionEngineTests/MonitoredBookSpecificationFixture.cs. */
describe("MonitoredBookSpecification", () => {
  const subject = new MonitoredBookSpecification();

  function build() {
    const author = makeAuthor({ monitored: true });
    const firstBook = makeBook({ id: 1, monitored: true });
    const secondBook = makeBook({ id: 2, monitored: true });

    return {
      author,
      firstBook,
      secondBook,
      single: makeRemoteBook({ author, books: [firstBook] }),
      multi: makeRemoteBook({ author, books: [firstBook, secondBook] }),
    };
  }

  function bookSearchCriteria(overrides: Partial<BookSearchCriteria> = {}): BookSearchCriteria {
    return {
      kind: "book",
      monitoredBooksOnly: false,
      userInvokedSearch: false,
      interactiveSearch: false,
      author: makeAuthor(),
      books: [],
      bookTitle: "",
      bookYear: 0,
      ...overrides,
    };
  }

  it("setup_should_return_monitored_book_should_return_true", () => {
    const { single, multi } = build();
    expect(subject.isSatisfiedBy(single, null).accepted).toBe(true);
    expect(subject.isSatisfiedBy(multi, null).accepted).toBe(true);
  });

  it("not_monitored_author_should_be_skipped", () => {
    const { author, multi } = build();
    author.monitored = false;
    expect(subject.isSatisfiedBy(multi, null).accepted).toBe(false);
  });

  it("only_book_not_monitored_should_return_false", () => {
    const { single, firstBook } = build();
    firstBook.monitored = false;
    expect(subject.isSatisfiedBy(single, null).accepted).toBe(false);
  });

  it("both_books_not_monitored_should_return_false", () => {
    const { multi, firstBook, secondBook } = build();
    firstBook.monitored = false;
    secondBook.monitored = false;
    expect(subject.isSatisfiedBy(multi, null).accepted).toBe(false);
  });

  it("only_first_book_not_monitored_should_return_false", () => {
    const { multi, firstBook } = build();
    firstBook.monitored = false;
    expect(subject.isSatisfiedBy(multi, null).accepted).toBe(false);
  });

  it("only_second_book_not_monitored_should_return_false", () => {
    const { multi, secondBook } = build();
    secondBook.monitored = false;
    expect(subject.isSatisfiedBy(multi, null).accepted).toBe(false);
  });

  it("should_return_true_for_single_book_search", () => {
    const { single, author } = build();
    author.monitored = false;
    expect(subject.isSatisfiedBy(single, bookSearchCriteria()).accepted).toBe(true);
  });

  it("should_return_true_if_book_is_not_monitored_and_monitoredBooksOnly_flag_is_false", () => {
    const { single, firstBook } = build();
    firstBook.monitored = false;
    expect(
      subject.isSatisfiedBy(single, bookSearchCriteria({ monitoredBooksOnly: false })).accepted
    ).toBe(true);
  });

  it("should_return_false_if_book_is_not_monitored_and_monitoredBooksOnly_flag_is_true", () => {
    const { single, firstBook } = build();
    firstBook.monitored = false;
    expect(
      subject.isSatisfiedBy(single, bookSearchCriteria({ monitoredBooksOnly: true })).accepted
    ).toBe(false);
  });

  it("should_return_false_if_all_books_are_not_monitored_for_discography_pack_release", () => {
    const { multi, secondBook } = build();
    secondBook.monitored = false;
    multi.parsedBookInfo = makeParsedBookInfo({ discography: true });

    expect(subject.isSatisfiedBy(multi, null).accepted).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { AuthorSpecification } from "../../../specifications/search/authorSpecification.js";
import type { BookSearchCriteria } from "../../../remoteBook.js";
import { makeAuthor, makeRemoteBook } from "../../testFixtures.js";

/** Ported from NzbDrone.Core.Test/DecisionEngineTests/Search/ArtistSpecificationFixture.cs. */
describe("AuthorSpecification", () => {
  const subject = new AuthorSpecification();
  const author1 = makeAuthor({ id: 1 });
  const author2 = makeAuthor({ id: 2 });

  function searchCriteriaFor(author: typeof author1): BookSearchCriteria {
    return {
      kind: "book",
      monitoredBooksOnly: false,
      userInvokedSearch: false,
      interactiveSearch: false,
      author,
      books: [],
      bookTitle: "",
      bookYear: 0,
    };
  }

  it("should_return_true_when_no_search_criteria", () => {
    const remoteBook = makeRemoteBook({ author: author1 });
    expect(subject.isSatisfiedBy(remoteBook, null).accepted).toBe(true);
  });

  it("should_return_false_if_author_doesnt_match", () => {
    const remoteBook = makeRemoteBook({ author: author1 });
    expect(subject.isSatisfiedBy(remoteBook, searchCriteriaFor(author2)).accepted).toBe(false);
  });

  it("should_return_true_when_author_ids_match", () => {
    const remoteBook = makeRemoteBook({ author: author1 });
    expect(subject.isSatisfiedBy(remoteBook, searchCriteriaFor(author1)).accepted).toBe(true);
  });
});

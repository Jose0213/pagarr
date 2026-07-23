import { describe, expect, it, vi } from "vitest";
import { IndexerTagSpecification } from "../../../specifications/rssSync/indexerTagSpecification.js";
import {
  ModelNotFoundException,
  type IndexerDefinition,
  type IndexerFactoryLike,
} from "../../../remoteBook.js";
import type { BookSearchCriteria } from "../../../remoteBook.js";
import { makeAuthor, makeBook, makeReleaseInfo, makeRemoteBook } from "../../testFixtures.js";

/** Ported from NzbDrone.Core.Test/DecisionEngineTests/RssSync/IndexerTagSpecificationFixture.cs. */
describe("IndexerTagSpecification", () => {
  function makeFactory(indexerTags: Set<number>): IndexerFactoryLike {
    return {
      get: vi.fn((id: number) => {
        if (id === 1) {
          return { id: 1, tags: indexerTags };
        }
        throw new ModelNotFoundException();
      }),
    };
  }

  function bookSearchCriteria(): BookSearchCriteria {
    return {
      kind: "book",
      monitoredBooksOnly: true,
      userInvokedSearch: false,
      interactiveSearch: false,
      author: makeAuthor(),
      books: [],
      bookTitle: "",
      bookYear: 0,
    };
  }

  function buildRemoteBook(authorTags: number[], indexerId = 1) {
    const author = makeAuthor({ tags: authorTags, monitored: true });
    return makeRemoteBook({
      author,
      books: [makeBook({ monitored: true }), makeBook({ id: 2, monitored: true })],
      release: makeReleaseInfo({ indexerId }),
    });
  }

  it("indexer_and_author_without_tags_should_return_true", () => {
    const subject = new IndexerTagSpecification(makeFactory(new Set()));
    expect(subject.isSatisfiedBy(buildRemoteBook([]), bookSearchCriteria()).accepted).toBe(true);
  });

  it("indexer_with_tags_author_without_tags_should_return_false", () => {
    const subject = new IndexerTagSpecification(makeFactory(new Set([123])));
    expect(subject.isSatisfiedBy(buildRemoteBook([]), bookSearchCriteria()).accepted).toBe(false);
  });

  it("indexer_without_tags_author_with_tags_should_return_true", () => {
    const subject = new IndexerTagSpecification(makeFactory(new Set()));
    expect(subject.isSatisfiedBy(buildRemoteBook([123]), bookSearchCriteria()).accepted).toBe(true);
  });

  it("indexer_with_tags_author_with_matching_tags_should_return_true", () => {
    const subject = new IndexerTagSpecification(makeFactory(new Set([123, 456])));
    expect(subject.isSatisfiedBy(buildRemoteBook([123, 789]), bookSearchCriteria()).accepted).toBe(
      true
    );
  });

  it("indexer_with_tags_author_with_different_tags_should_return_false", () => {
    const subject = new IndexerTagSpecification(makeFactory(new Set([456])));
    expect(subject.isSatisfiedBy(buildRemoteBook([123, 789]), bookSearchCriteria()).accepted).toBe(
      false
    );
  });

  it("release_without_indexerid_should_return_true", () => {
    const subject = new IndexerTagSpecification(makeFactory(new Set([456])));
    expect(
      subject.isSatisfiedBy(buildRemoteBook([123, 789], 0), bookSearchCriteria()).accepted
    ).toBe(true);
  });

  it("release_with_invalid_indexerid_should_return_true", () => {
    const subject = new IndexerTagSpecification(makeFactory(new Set([456])));
    expect(
      subject.isSatisfiedBy(buildRemoteBook([123, 789], 2), bookSearchCriteria()).accepted
    ).toBe(true);
  });
});

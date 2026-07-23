import { describe, expect, it, vi } from "vitest";
import { EarlyReleaseSpecification } from "../../specifications/earlyReleaseSpecification.js";
import {
  ModelNotFoundException,
  type IndexerDefinition,
  type IndexerFactoryLike,
  type TorrentInfo,
} from "../../remoteBook.js";
import { makeAuthor, makeBook, makeRemoteBook } from "../testFixtures.js";

/** Ported from NzbDrone.Core.Test/DecisionEngineTests/EarlyReleaseSpecificationFixture.cs. */
describe("EarlyReleaseSpecification", () => {
  const indexerDefinition: IndexerDefinition = {
    id: 1,
    tags: new Set(),
    settings: { earlyReleaseLimit: 5 },
  };

  function makeFactory(impl?: (id: number) => IndexerDefinition): IndexerFactoryLike {
    return {
      get: vi.fn(
        impl ??
          ((id: number) =>
            id === 1
              ? indexerDefinition
              : (() => {
                  throw new ModelNotFoundException();
                })())
      ),
    };
  }

  function buildRemoteBook(publishDaysFromToday: number) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const publishDate = new Date(
      today.getTime() + publishDaysFromToday * 24 * 60 * 60 * 1000
    ).toISOString();

    const book1 = makeBook({ id: 1, releaseDate: today.toISOString() });
    const author = makeAuthor({ id: 1 });

    return makeRemoteBook({
      author,
      books: [book1],
      release: {
        guid: "g",
        title: "Author - Book [FLAC-RlsGrp]",
        size: 0,
        downloadUrl: "",
        indexerId: 1,
        indexer: "test",
        indexerPriority: 0,
        downloadProtocol: 2, // Torrent
        publishDate,
      },
    });
  }

  it("should_return_true_if_indexer_not_specified", () => {
    const subject = new EarlyReleaseSpecification(makeFactory());
    const remoteBook = buildRemoteBook(0);
    remoteBook.release.indexerId = 0;

    expect(subject.isSatisfiedBy(remoteBook, null).accepted).toBe(true);
  });

  it("should_return_true_if_release_contains_multiple_books", () => {
    const subject = new EarlyReleaseSpecification(makeFactory());
    const remoteBook = buildRemoteBook(0);
    remoteBook.books.push(makeBook({ id: 2, releaseDate: remoteBook.books[0]!.releaseDate }));

    expect(subject.isSatisfiedBy(remoteBook, null).accepted).toBe(true);
  });

  it("should_return_true_if_indexer_no_longer_exists", () => {
    const subject = new EarlyReleaseSpecification(
      makeFactory(() => {
        throw new ModelNotFoundException();
      })
    );

    expect(subject.isSatisfiedBy(buildRemoteBook(0), null).accepted).toBe(true);
  });

  it.each([-2, -5])(
    "should_return_true_if_publish_date_above_or_equal_to_limit: %i days",
    (days) => {
      const subject = new EarlyReleaseSpecification(makeFactory());
      expect(subject.isSatisfiedBy(buildRemoteBook(days), null).accepted).toBe(true);
    }
  );

  it.each([-10, -20])("should_return_false_if_publish_date_below_limit: %i days", (days) => {
    const subject = new EarlyReleaseSpecification(makeFactory());
    expect(subject.isSatisfiedBy(buildRemoteBook(days), null).accepted).toBe(false);
  });

  it.each([-10, -100])("should_return_true_if_limit_null: %i days", (days) => {
    const subject = new EarlyReleaseSpecification(
      makeFactory(() => ({ ...indexerDefinition, settings: { earlyReleaseLimit: null } }))
    );
    expect(subject.isSatisfiedBy(buildRemoteBook(days), null).accepted).toBe(true);
  });
});

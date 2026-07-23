import { describe, expect, it } from "vitest";
import { DiscographySpecification } from "../../specifications/discographySpecification.js";
import {
  makeAuthor,
  makeBook,
  makeParsedBookInfo,
  makeReleaseInfo,
  makeRemoteBook,
} from "../testFixtures.js";

/** Ported from NzbDrone.Core.Test/DecisionEngineTests/DiscographySpecificationFixture.cs. */
describe("DiscographySpecification", () => {
  const subject = new DiscographySpecification();

  function buildRemoteBook() {
    const author = makeAuthor({ id: 1234 });
    return makeRemoteBook({
      parsedBookInfo: makeParsedBookInfo({ discography: true }),
      author,
      books: [
        makeBook({ id: 1, releaseDate: daysFromNow(-8) }),
        makeBook({ id: 2, releaseDate: daysFromNow(-8) }),
        makeBook({ id: 3, releaseDate: daysFromNow(-8) }),
      ],
      release: makeReleaseInfo({ title: "Author.Discography.1978.2005.FLAC-RlsGrp" }),
    });
  }

  function daysFromNow(days: number): string {
    return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
  }

  it("should_return_true_if_is_not_a_discography", () => {
    const remoteBook = buildRemoteBook();
    remoteBook.parsedBookInfo.discography = false;
    remoteBook.books[2]!.releaseDate = daysFromNow(2);

    expect(subject.isSatisfiedBy(remoteBook, null).accepted).toBe(true);
  });

  it("should_return_true_if_all_books_have_released", () => {
    expect(subject.isSatisfiedBy(buildRemoteBook(), null).accepted).toBe(true);
  });

  it("should_return_false_if_one_book_has_not_released", () => {
    const remoteBook = buildRemoteBook();
    remoteBook.books[2]!.releaseDate = daysFromNow(2);

    expect(subject.isSatisfiedBy(remoteBook, null).accepted).toBe(false);
  });

  it("should_return_false_if_an_book_does_not_have_an_release_date", () => {
    const remoteBook = buildRemoteBook();
    remoteBook.books[2]!.releaseDate = null;

    expect(subject.isSatisfiedBy(remoteBook, null).accepted).toBe(false);
  });
});

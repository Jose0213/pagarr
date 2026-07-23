import { describe, expect, it } from "vitest";
import { newLocalBook } from "../../parser/model/localBook.js";
import { newLocalEdition } from "../../parser/model/localEdition.js";
import { newAuthor, newBook, newEdition } from "../../books/index.js";
import { populateMatch } from "../bookImport/identification/populateMatch.js";

/**
 * populateMatch() is the exact mechanism behind known-issues-fixlist.md
 * item #4 (manual-import edition selection not sticking): `keepAllEditions
 * = false` (automated import) clones a fresh single-edition Book/Author
 * graph; `keepAllEditions = true` (manual import) keeps the ORIGINAL
 * matched Edition -- with its real, full `book.editions` list -- as-is.
 * These tests pin down that exact distinction so a future patch has solid
 * ground to stand on, per this module's task brief.
 */

function buildMatchedGraph() {
  const author = { ...newAuthor(), id: 42, path: "/music/author" };
  const book = { ...newBook(), id: 7, title: "The Book", author, authorMetadataId: 1 };
  const otherEdition = { ...newEdition(), id: 100, title: "Other Edition", monitored: false };
  const matchedEdition = {
    ...newEdition(),
    id: 101,
    title: "Matched Edition",
    monitored: true,
    book,
  };
  book.editions = [otherEdition, matchedEdition];

  return { author, book, matchedEdition, otherEdition };
}

describe("populateMatch", () => {
  it("is a no-op when there is no matched edition", () => {
    const localEdition = newLocalEdition([newLocalBook()]);
    localEdition.edition = null;

    populateMatch(localEdition, false);

    expect(localEdition.edition).toBeNull();
  });

  it("keepAllEditions=false replaces the matched edition with a clone whose book.editions has exactly ONE edition", () => {
    const { matchedEdition } = buildMatchedGraph();
    const track = newLocalBook();
    track.path = "/music/author/book/track1.mp3";

    const localEdition = newLocalEdition([track]);
    localEdition.edition = matchedEdition;

    populateMatch(localEdition, false);

    // The edition object itself is a NEW clone, not the original reference.
    expect(localEdition.edition).not.toBe(matchedEdition);
    expect(localEdition.edition.foreignEditionId).toBe(matchedEdition.foreignEditionId);
    expect(localEdition.edition.title).toBe(matchedEdition.title);

    // This is the crux of known-issues-fixlist.md #4: the cloned book's
    // editions list contains ONLY the matched edition -- any sibling
    // edition (e.g. one a user picked via a different path) is dropped.
    expect(localEdition.edition.book!.editions).toHaveLength(1);
    expect(localEdition.edition.book!.editions![0]!.foreignEditionId).toBe(
      matchedEdition.foreignEditionId
    );

    // Local tracks are repointed at the cloned graph.
    for (const localTrack of localEdition.localBooks) {
      expect(localTrack.edition).toBe(localEdition.edition);
      expect(localTrack.book).toBe(localEdition.edition.book);
      expect(localTrack.author).toBe(localEdition.edition.book!.author);
      expect(localTrack.partCount).toBe(localEdition.localBooks.length);
    }
  });

  it("keepAllEditions=true keeps the ORIGINAL matched edition object with its full book.editions list intact", () => {
    const { matchedEdition, book, otherEdition } = buildMatchedGraph();
    const track = newLocalBook();
    track.path = "/music/author/book/track1.mp3";

    const localEdition = newLocalEdition([track]);
    localEdition.edition = matchedEdition;

    populateMatch(localEdition, true);

    // Same object reference as the matched edition -- nothing cloned.
    expect(localEdition.edition).toBe(matchedEdition);

    // The full editions list (both editions) survives -- this is exactly
    // what lets a manually-selected edition "stick" for downstream
    // naming/organizing, per known-issues-fixlist.md #4.
    expect(localEdition.edition.book).toBe(book);
    expect(localEdition.edition.book!.editions).toHaveLength(2);
    expect(localEdition.edition.book!.editions).toContain(otherEdition);
    expect(localEdition.edition.book!.editions).toContain(matchedEdition);

    for (const localTrack of localEdition.localBooks) {
      expect(localTrack.edition).toBe(matchedEdition);
      expect(localTrack.book).toBe(book);
      expect(localTrack.author).toBe(book.author);
    }
  });

  it("keepAllEditions=false clone preserves the matched edition's DB-owned id via UseDbFieldsFrom", () => {
    const { matchedEdition } = buildMatchedGraph();
    const localEdition = newLocalEdition([newLocalBook()]);
    localEdition.edition = matchedEdition;

    populateMatch(localEdition, false);

    // UseDbFieldsFrom pulls id/bookId/monitored/manualAdd from the matched
    // edition onto the fresh clone -- the clone is NOT a blank id=0 shell.
    expect(localEdition.edition.id).toBe(matchedEdition.id);
    expect(localEdition.edition.monitored).toBe(matchedEdition.monitored);
  });

  it("keepAllEditions=false merges existingTracks into localBooks (deduplicated by path) before repointing", () => {
    const { matchedEdition } = buildMatchedGraph();
    const track1 = newLocalBook();
    track1.path = "/music/author/book/track1.mp3";
    const existingTrack = newLocalBook();
    existingTrack.path = "/music/author/book/track0.mp3";
    const duplicateOfTrack1 = newLocalBook();
    duplicateOfTrack1.path = track1.path;

    const localEdition = newLocalEdition([track1]);
    localEdition.edition = matchedEdition;
    localEdition.existingTracks = [existingTrack, duplicateOfTrack1];

    populateMatch(localEdition, false);

    // track1 + existingTrack survive; duplicateOfTrack1 (same path as
    // track1) is deduped away -- ported from `.DistinctBy(x => x.Path)`.
    expect(localEdition.localBooks.map((t) => t.path).sort()).toEqual(
      [track1.path, existingTrack.path].sort()
    );
  });

  it("throws if the matched edition has no Book relation populated (Book.author graph incomplete)", () => {
    const badEdition = { ...newEdition(), id: 1, book: undefined };
    const localEdition = newLocalEdition([newLocalBook()]);
    localEdition.edition = badEdition;

    expect(() => populateMatch(localEdition, false)).toThrow(/Book relation/);
  });
});

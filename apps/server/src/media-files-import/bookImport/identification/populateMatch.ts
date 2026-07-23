import type { LocalEdition } from "../../../parser/model/localEdition.js";
import {
  useMetadataFromEdition,
  useDbFieldsFromEdition,
  useMetadataFromBook,
  useDbFieldsFromBook,
  useMetadataFromAuthor,
  useDbFieldsFromAuthor,
  newEdition,
  newBook,
  newAuthor,
  type Author,
  type Book,
  type Edition,
  type SeriesBookLink,
} from "../../../books/index.js";

/**
 * Ported from NzbDrone.Core/Parser/Model/LocalEdition.cs's
 * `PopulateMatch(bool keepAllEditions)`.
 *
 * `parser/model/localEdition.ts` explicitly deferred porting this method
 * (see that file's doc comment) because it needs the full Edition/Book/
 * Author/BookFile graph that only exists once MediaFiles (this module)
 * lands. This IS that landing -- ported here as a free function (this
 * module's established pattern for behavior attached to Parser's pure
 * data shapes, matching e.g. localBook.ts/localEdition.ts's own free
 * functions like `trackCount`/`localEditionToString`) rather than
 * reaching back into parser/model/localEdition.ts to add an instance
 * method there (out of this worktree's scope -- only media-files-import/
 * may be touched).
 *
 * ## `keepAllEditions` -- this is known-issues-fixlist.md item #4
 *
 * `keepAllEditions === false` (the default, automated-import path): a
 * FRESH Edition/Book/Author graph is built via `UseMetadataFrom`/
 * `UseDbFieldsFrom` (merging the matched Edition's remote metadata onto a
 * blank shell, keeping DB-owned identity fields like `id`/`monitored`),
 * and that fresh graph -- with exactly ONE edition in `book.editions` --
 * replaces `localEdition.edition`. This is what "avoid holding references
 * to *every* edition we have seen during the matching process" (the C#
 * comment) buys: a much smaller object graph, but it means whichever
 * edition `IdentificationService` most recently matched onto `Edition` is
 * the one and only edition surviving into `book.editions`.
 *
 * `keepAllEditions === true` (the manual-import path -- see
 * `manual/manualImportService.ts`'s `KeepAllEditions: true` config): the
 * ORIGINAL matched `Edition` object (with its real `book.editions` list,
 * i.e. every edition the book actually has) is kept as-is and assigned
 * directly. This is the exact mechanism that must be preserved faithfully
 * per this module's task brief: readarr#2472 / bookshelf#96 report that a
 * user's manual edition override doesn't "stick" for naming/organizing --
 * this method is the boundary where a manually-selected edition either
 * survives (keepAllEditions=true, full graph preserved) or gets replaced
 * by a freshly cloned single-edition graph (keepAllEditions=false). Ported
 * verbatim, not fixed -- see this module's task brief for why.
 */
export function populateMatch(localEdition: LocalEdition, keepAllEditions: boolean): void {
  if (localEdition.edition === null) {
    return;
  }

  const matchedEdition = localEdition.edition;

  localEdition.localBooks = distinctByPath([
    ...localEdition.localBooks,
    ...(localEdition.existingTracks ?? []),
  ]);

  if (!keepAllEditions) {
    // Manually clone the edition / book to avoid holding references to *every* edition we have
    // seen during the matching process.
    // Ported from `var edition = new Edition(); edition.UseMetadataFrom(Edition);
    // edition.UseDbFieldsFrom(Edition);` -- BOTH calls read from the matched
    // `Edition` (`matchedEdition` here), not the fresh shell: UseDbFieldsFrom
    // pulls the matched edition's real DB-owned fields (id, bookId,
    // monitored, manualAdd) onto the freshly-metadata-merged clone.
    const editionShell = newEdition();
    let edition: Edition = useMetadataFromEdition(editionShell, matchedEdition);
    edition = useDbFieldsFromEdition(edition, matchedEdition);
    // C#'s `edition.BookFiles = Edition.BookFiles` is NOT ported: this
    // port's `Edition` (books/models.ts) has no `bookFiles` LazyLoaded
    // field -- see parser/model/localEdition.ts's doc comment acknowledging
    // this exact gap. Nothing in this module's own ported surface reads
    // `Edition.bookFiles` (BookFileService queries BookFiles by editionId
    // directly instead -- see mediaFileService.ts), so this is a
    // shape-only omission with no observable behavior difference for any
    // ported call site.

    const fullBook = matchedEdition.book;
    if (fullBook === undefined) {
      throw new Error("Matched Edition has no Book relation populated");
    }

    // Ported from `var book = new Book(); book.UseMetadataFrom(fullBook);
    // book.UseDbFieldsFrom(fullBook);` -- same pattern: both merges read
    // from `fullBook` (the matched edition's real Book), not the shell.
    const bookShell = newBook();
    let book: Book = useMetadataFromBook(bookShell, fullBook);
    book = useDbFieldsFromBook(book, fullBook);
    // C#'s `book.BookFiles = fullBook.BookFiles` likewise not ported -- same
    // "no bookFiles field on this port's Book" reason as edition.BookFiles above.

    const fullAuthor = fullBook.author;
    if (fullAuthor === undefined) {
      throw new Error("Matched Book has no Author relation populated");
    }

    // Ported from `book.Author.Value.UseMetadataFrom(fullBook.Author.Value)`:
    // C#'s `new Book()` constructor eagerly allocates an empty `Author`
    // shell for `Author.Value` (LazyLoaded<T> still needs a settable
    // backing instance); `UseMetadataFrom`/`UseDbFieldsFrom` are then
    // called ON that shell, merging fullAuthor's fields onto it -- ported
    // here as a fresh `newAuthor()` shell merged the same way, not
    // `fullAuthor` mutated/copied in place.
    const authorShell = newAuthor();
    let clonedAuthor: Author = useMetadataFromAuthor(authorShell, fullAuthor);
    clonedAuthor = useDbFieldsFromAuthor(clonedAuthor, fullAuthor);
    clonedAuthor.metadata = fullBook.authorMetadata;

    book.author = clonedAuthor;
    book.authorMetadata = fullBook.authorMetadata;
    book.editions = [edition];

    // C#: `if (fullBook.SeriesLinks.IsLoaded)` -- this port has no
    // LazyLoaded wrapper (see books/models.ts's doc comment), so
    // `seriesLinks` being populated at all stands in for `IsLoaded`.
    if (fullBook.seriesLinks !== undefined) {
      book.seriesLinks = fullBook.seriesLinks.map((l): SeriesBookLink => ({
        id: 0,
        book,
        series: l.series
          ? {
              id: 0,
              foreignSeriesId: l.series.foreignSeriesId,
              title: l.series.title,
              description: l.series.description,
              numbered: l.series.numbered,
              workCount: l.series.workCount,
              primaryWorkCount: l.series.primaryWorkCount,
            }
          : undefined,
        isPrimary: l.isPrimary,
        position: l.position,
        seriesPosition: l.seriesPosition,
        seriesId: 0,
        bookId: 0,
      }));
    } else {
      book.seriesLinks = fullBook.seriesLinks;
    }

    edition.book = book;

    localEdition.edition = edition;

    for (const localTrack of localEdition.localBooks) {
      localTrack.edition = edition;
      localTrack.book = book;
      localTrack.author = book.author;
      localTrack.partCount = localEdition.localBooks.length;
    }
  } else {
    for (const localTrack of localEdition.localBooks) {
      localTrack.edition = matchedEdition;
      localTrack.book = matchedEdition.book ?? null;
      localTrack.author = matchedEdition.book?.author ?? null;
      localTrack.partCount = localEdition.localBooks.length;
    }
  }
}

function distinctByPath<T extends { path: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of items) {
    if (!seen.has(item.path)) {
      seen.add(item.path);
      result.push(item);
    }
  }
  return result;
}

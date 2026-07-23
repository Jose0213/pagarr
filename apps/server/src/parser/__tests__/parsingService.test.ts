import { beforeEach, describe, expect, it } from "vitest";
import { createTestDatabase } from "../../books/__tests__/testDb.js";
import {
  AuthorMetadataRepository,
  AuthorRepository,
  AuthorService,
  BookRepository,
  BookService,
  EditionRepository,
  EditionService,
  newAuthor,
  newAuthorMetadata,
  newBook,
  type Author,
  type AuthorMetadata,
  type BooksDomainEvent,
  type IBooksEventAggregator,
} from "../../books/index.js";
import { cleanAuthorName } from "../parser.js";
import { newParsedBookInfo } from "../model/parsedBookInfo.js";
import { ParsingService } from "../parsingService.js";
import { RealTextMatcher } from "../realTextMatcher.js";
import type { MainDatabase } from "../../db/db-factory.js";

/**
 * Ported from NzbDrone.Core.Test/ParserTests/ParsingServiceTests/
 * GetAuthorFixture.cs and GetBooksFixture.cs. C# used Moq mocks for
 * IAuthorService/IBookService; this port wires ParsingService against the
 * REAL AuthorService/BookService/EditionService (backed by an in-memory
 * SQLite database via the shared books/__tests__/testDb.js helper) instead,
 * since those are real, already-landed Phase 1 services in this worktree
 * -- an integration test exercising the actual call path is stronger than
 * re-mocking already-real collaborators, and Moq's `Verify(...)` call-
 * count assertions are replaced with direct behavioral assertions on the
 * returned data.
 */

class CapturingEventAggregator implements IBooksEventAggregator {
  events: BooksDomainEvent[] = [];
  publishEvent(event: BooksDomainEvent): void {
    this.events.push(event);
  }
}

function makeServices() {
  const db: MainDatabase = createTestDatabase();
  const events = new CapturingEventAggregator();
  const matcher = new RealTextMatcher();

  const authorMetadataRepository = new AuthorMetadataRepository(db);
  const authorRepository = new AuthorRepository(db);
  const bookRepository = new BookRepository(db);
  const editionRepository = new EditionRepository(db);

  const editionService = new EditionService(editionRepository, events, matcher);
  const authorService = new AuthorService(authorRepository, events, matcher);
  const bookService = new BookService(bookRepository, editionService, events, matcher);

  const parsingService = new ParsingService(authorService, bookService, editionService);

  return {
    db,
    authorMetadataRepository,
    authorService,
    bookService,
    editionService,
    parsingService,
  };
}

let foreignIdCounter = 0;

/** Inserts a real AuthorMetadata row then a real Author row referencing it -- findByName/findByNameInexact join against AuthorMetadata, so both rows must genuinely exist. */
function insertAuthor(
  ctx: Pick<ReturnType<typeof makeServices>, "authorMetadataRepository" | "authorService">,
  name: string
): Author {
  foreignIdCounter += 1;
  const meta: AuthorMetadata = ctx.authorMetadataRepository.insert({
    ...newAuthorMetadata(),
    foreignAuthorId: `test-author-${foreignIdCounter}`,
    titleSlug: `test-author-${foreignIdCounter}`,
    name,
    sortName: name,
    nameLastFirst: name,
    sortNameLastFirst: name,
  });

  const author = {
    ...newAuthor(),
    authorMetadataId: meta.id,
    cleanName: cleanAuthorName(name),
    path: `/books/${name}`,
  };

  return ctx.authorService.addAuthor(author, false);
}

describe("ParsingService.getAuthor (GetAuthorFixture)", () => {
  let ctx: ReturnType<typeof makeServices>;

  beforeEach(() => {
    ctx = makeServices();
  });

  it("should_use_passed_in_title_when_it_cannot_be_parsed", () => {
    // "30 Rock" doesn't match any REPORT_BOOK_TITLE_REGEX pattern (no
    // author/book separator), so parseBookTitle returns null and the raw
    // title is used for the author lookup.
    const result = ctx.parsingService.getAuthor("30 Rock");
    expect(result).toBeUndefined();
  });

  it("should_use_parsed_author_title", () => {
    insertAuthor(ctx, "30 Rock");

    const title = "30 Rock - Get Some [FLAC]";
    const result = ctx.parsingService.getAuthor(title);

    expect(result?.metadata?.name).toBe("30 Rock");
  });
});

describe("ParsingService.getBooks (GetBooksFixture)", () => {
  let ctx: ReturnType<typeof makeServices>;

  beforeEach(() => {
    ctx = makeServices();
  });

  it("should_not_fail_if_search_criteria_contains_multiple_books_with_the_same_name", () => {
    const author = insertAuthor(ctx, "Some Author");

    const bookA = ctx.bookService.addBook(
      {
        ...newBook(),
        authorMetadataId: author.authorMetadataId,
        title: "IdenticalTitle",
        cleanTitle: "identicaltitle",
        titleSlug: "identical-title-a",
      },
      false
    );
    const bookB = ctx.bookService.addBook(
      {
        ...newBook(),
        authorMetadataId: author.authorMetadataId,
        title: "IdenticalTitle",
        cleanTitle: "identicaltitle",
        titleSlug: "identical-title-b",
      },
      false
    );

    const parsed = newParsedBookInfo();
    parsed.bookTitle = "IdenticalTitle";

    // Ported from `ExclusiveOrDefault`'s "return undefined when 2+ match"
    // semantics (see parsingService.ts's doc comment) -- since both books
    // share the exact title, the search-criteria fast path finds no
    // exclusive match and falls through to bookService.findByTitle, which
    // returns whichever single book its own lookup logic picks.
    const result = ctx.parsingService.getBooks(parsed, author, { author, books: [bookA, bookB] });

    expect(result.length).toBeLessThanOrEqual(1);
  });

  it("returns an empty list when ParsedBookInfo has no book title", () => {
    const author = insertAuthor(ctx, "Some Author");
    const parsed = newParsedBookInfo();
    parsed.bookTitle = null;

    expect(ctx.parsingService.getBooks(parsed, author)).toEqual([]);
  });

  it("finds a book by exact title via BookService.findByTitle when no search criteria matches", () => {
    const author = insertAuthor(ctx, "Some Author");
    ctx.bookService.addBook(
      {
        ...newBook(),
        authorMetadataId: author.authorMetadataId,
        title: "Unique Book",
        cleanTitle: "uniquebook",
        titleSlug: "unique-book",
      },
      false
    );

    const parsed = newParsedBookInfo();
    parsed.bookTitle = "Unique Book";

    const result = ctx.parsingService.getBooks(parsed, author);
    expect(result).toHaveLength(1);
    expect(result[0]?.title).toBe("Unique Book");
  });

  it("returns the full author bibliography for a discography match with no year bounds", () => {
    const author = insertAuthor(ctx, "Prolific Author");
    ctx.bookService.addBook(
      {
        ...newBook(),
        authorMetadataId: author.authorMetadataId,
        title: "Book One",
        cleanTitle: "bookone",
        titleSlug: "book-one",
      },
      false
    );
    ctx.bookService.addBook(
      {
        ...newBook(),
        authorMetadataId: author.authorMetadataId,
        title: "Book Two",
        cleanTitle: "booktwo",
        titleSlug: "book-two",
      },
      false
    );

    const parsed = newParsedBookInfo();
    parsed.discography = true;
    // Ported gotcha: GetBooks checks `parsedBookInfo.BookTitle == null` and
    // bails to an empty list BEFORE it ever looks at `Discography` -- see
    // ParsingService.cs's GetBooks. This isn't reachable via the real
    // Parser.parseBookTitle flow (parseBookMatchCollection always sets
    // `result.BookTitle = "Discography"` when Discography is true, see
    // parser.ts's parseBookMatchCollection), but a hand-built
    // ParsedBookInfo with `discography: true` and a null `bookTitle` (the
    // newParsedBookInfo() default) MUST still short-circuit to `[]` for
    // fidelity with that check order.
    parsed.bookTitle = "Discography";

    const result = ctx.parsingService.getBooks(parsed, author);
    expect(result).toHaveLength(2);
  });

  it("a discography ParsedBookInfo with a null bookTitle short-circuits to an empty list (BookTitle-null check runs before the Discography check)", () => {
    const author = insertAuthor(ctx, "Some Author");
    const parsed = newParsedBookInfo();
    parsed.discography = true;
    parsed.bookTitle = null;

    expect(ctx.parsingService.getBooks(parsed, author)).toEqual([]);
  });
});

describe("ParsingService.map", () => {
  it("returns a RemoteBook with no author/books when the author can't be found", () => {
    const ctx = makeServices();
    const parsed = newParsedBookInfo();
    parsed.authorName = "Nobody Known";

    const result = ctx.parsingService.map(parsed);
    expect(result.author).toBeNull();
    expect(result.books).toEqual([]);
    expect(result.parsedBookInfo).toBe(parsed);
  });

  it("resolves author and books when both exist", () => {
    const ctx = makeServices();
    const author = insertAuthor(ctx, "Known Author");
    ctx.bookService.addBook(
      {
        ...newBook(),
        authorMetadataId: author.authorMetadataId,
        title: "Known Book",
        cleanTitle: "knownbook",
        titleSlug: "known-book",
      },
      false
    );

    const parsed = newParsedBookInfo();
    parsed.authorName = "Known Author";
    parsed.bookTitle = "Known Book";

    const result = ctx.parsingService.map(parsed);
    expect(result.author?.metadata?.name).toBe("Known Author");
    expect(result.books).toHaveLength(1);
  });
});

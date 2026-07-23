import { describe, expect, it, afterEach, beforeEach } from "vitest";
import { createTestDatabase } from "./testDb.js";
import { AuthorRepository } from "../authorRepository.js";
import { AuthorMetadataRepository } from "../authorMetadataRepository.js";
import { AuthorService } from "../authorService.js";
import type { MainDatabase } from "../../db/db-factory.js";
import {
  AuthorAddedEvent,
  AuthorDeletedEvent,
  AuthorEditedEvent,
  AuthorsImportedEvent,
  type BooksDomainEvent,
  type IBooksEventAggregator,
} from "../events.js";
import { NullTextMatcher, type ITextMatcher } from "../textMatching.js";
import { newAuthor, newAuthorMetadata, type Author, type AuthorMetadata } from "../models.js";

class CapturingEventAggregator implements IBooksEventAggregator {
  events: BooksDomainEvent[] = [];
  publishEvent(event: BooksDomainEvent): void {
    this.events.push(event);
  }
}

/** A matcher whose fuzzyMatch returns 1 for an exact string match, 0 otherwise -- enough to exercise inexact-match search without a real Bitap implementation. */
class ExactOnlyTextMatcher implements ITextMatcher {
  cleanAuthorName(name: string): string {
    return name.toLowerCase();
  }
  fuzzyMatch(a: string, b: string): number {
    return a.toLowerCase() === b.toLowerCase() ? 1 : 0;
  }
  fuzzyContains(): number {
    return 0;
  }
  removeBracketsAndContents(text: string): string {
    return text;
  }
  removeAfterDash(text: string): string {
    return text;
  }
  splitBookTitle(book: string): [string, string] {
    return [book, ""];
  }
}

describe("AuthorService", () => {
  let db: MainDatabase;
  let authorRepo: AuthorRepository;
  let metaRepo: AuthorMetadataRepository;
  let events: CapturingEventAggregator;
  let service: AuthorService;

  beforeEach(() => {
    db = createTestDatabase();
    authorRepo = new AuthorRepository(db);
    metaRepo = new AuthorMetadataRepository(db);
    events = new CapturingEventAggregator();
    service = new AuthorService(authorRepo, events, new NullTextMatcher());
  });

  afterEach(() => {
    db.close();
  });

  function insertAuthorWithMetadata(
    overrides: Partial<Author> = {},
    metaOverrides: Partial<AuthorMetadata> = {}
  ) {
    const meta = metaRepo.insert({
      ...newAuthorMetadata(),
      foreignAuthorId: "fa-1",
      titleSlug: "author-one",
      name: "Author One",
      ...metaOverrides,
    });

    return authorRepo.insert({
      ...newAuthor(),
      authorMetadataId: meta.id,
      cleanName: "authorone",
      path: "/books/Author One",
      monitored: true,
      ...overrides,
    });
  }

  describe("addAuthor / addAuthors", () => {
    it("inserts and publishes AuthorAddedEvent with the doRefresh flag", () => {
      const meta = metaRepo.insert({
        ...newAuthorMetadata(),
        foreignAuthorId: "fa-1",
        titleSlug: "s",
        name: "N",
      });
      const author = {
        ...newAuthor(),
        authorMetadataId: meta.id,
        cleanName: "n",
        path: "/books/N",
      };

      const inserted = service.addAuthor(author, true);

      expect(inserted.id).toBeGreaterThan(0);
      expect(events.events).toHaveLength(1);
      expect(events.events[0]).toBeInstanceOf(AuthorAddedEvent);
      expect((events.events[0] as AuthorAddedEvent).doRefresh).toBe(true);
    });

    it("addAuthors inserts many and publishes a single AuthorsImportedEvent", () => {
      const meta1 = metaRepo.insert({
        ...newAuthorMetadata(),
        foreignAuthorId: "fa-1",
        titleSlug: "s1",
        name: "N1",
      });
      const meta2 = metaRepo.insert({
        ...newAuthorMetadata(),
        foreignAuthorId: "fa-2",
        titleSlug: "s2",
        name: "N2",
      });

      const inserted = service.addAuthors(
        [
          { ...newAuthor(), authorMetadataId: meta1.id, cleanName: "n1", path: "/books/N1" },
          { ...newAuthor(), authorMetadataId: meta2.id, cleanName: "n2", path: "/books/N2" },
        ],
        false
      );

      expect(inserted).toHaveLength(2);
      expect(events.events[0]).toBeInstanceOf(AuthorsImportedEvent);
      expect((events.events[0] as AuthorsImportedEvent).doRefresh).toBe(false);
    });
  });

  it("deleteAuthor removes the row and publishes AuthorDeletedEvent", () => {
    const author = insertAuthorWithMetadata();

    service.deleteAuthor(author.id, true, false);

    expect(authorRepo.find(author.id)).toBeUndefined();
    expect(events.events[0]).toBeInstanceOf(AuthorDeletedEvent);
    expect((events.events[0] as AuthorDeletedEvent).deleteFiles).toBe(true);
  });

  it("findById / findByName delegate to the repository", () => {
    // NullTextMatcher.cleanAuthorName is identity (see textMatching.ts),
    // so findByName only lower-invariants the input (that lowercasing
    // happens inside AuthorRepository.findByName itself, matching C#'s
    // `cleanName.ToLowerInvariant()` -- see that method's doc comment).
    // CleanName is stored already-lowercased to match what findByName will
    // compare against.
    const author = insertAuthorWithMetadata({ cleanName: "author one" });

    expect(service.findById("fa-1")?.id).toBe(author.id);
    expect(service.findByName("Author One")?.id).toBe(author.id);
  });

  it("allForTag filters getAllAuthors() by tag membership", () => {
    insertAuthorWithMetadata({ tags: [1, 2] }, { foreignAuthorId: "fa-1", titleSlug: "s1" });
    insertAuthorWithMetadata({ tags: [3] }, { foreignAuthorId: "fa-2", titleSlug: "s2" });

    expect(service.allForTag(1)).toHaveLength(1);
    expect(service.allForTag(3)).toHaveLength(1);
    expect(service.allForTag(99)).toHaveLength(0);
  });

  it("getAllAuthorTags / allAuthorPaths delegate to the repository", () => {
    const author = insertAuthorWithMetadata({ tags: [5], path: "/books/A" });

    expect(service.getAllAuthorTags().get(author.id)).toEqual([5]);
    expect(service.allAuthorPaths().get(author.id)).toBe("/books/A");
  });

  it("getAuthor / getAuthorByMetadataId / getAuthors delegate to the repository", () => {
    const author = insertAuthorWithMetadata();

    expect(service.getAuthor(author.id).id).toBe(author.id);
    expect(service.getAuthorByMetadataId(author.authorMetadataId)?.id).toBe(author.id);
    expect(service.getAuthors([author.id])).toHaveLength(1);
  });

  it("removeAddOptions sets only the addOptions field", () => {
    const author = insertAuthorWithMetadata({
      addOptions: {
        monitor: "All",
        booksToMonitor: [],
        monitored: true,
        searchForMissingBooks: true,
      } as never,
    });

    service.removeAddOptions({ ...author, addOptions: undefined });

    expect(authorRepo.get(author.id).addOptions).toBeUndefined();
  });

  describe("updateAuthor", () => {
    it("never persists a caller-supplied addOptions -- keeps the stored value", () => {
      const author = insertAuthorWithMetadata({
        addOptions: {
          monitor: "All",
          booksToMonitor: [],
          monitored: true,
          searchForMissingBooks: false,
        } as never,
      });

      const updated = service.updateAuthor({
        ...author,
        path: "/books/New Path",
        addOptions: {
          monitor: "None",
          booksToMonitor: [],
          monitored: false,
          searchForMissingBooks: true,
        } as never,
      });

      expect(updated.path).toBe("/books/New Path");
      expect((updated.addOptions as never as { monitor: string }).monitor).toBe("All");
      expect(events.events[0]).toBeInstanceOf(AuthorEditedEvent);
    });
  });

  it("updateAuthors recomputes Path via the injected buildPath callback only when rootFolderPath is set", () => {
    const a = insertAuthorWithMetadata(
      { rootFolderPath: "/books", path: "/old/path" },
      { foreignAuthorId: "fa-1", titleSlug: "s1" }
    );
    const b = insertAuthorWithMetadata(
      { rootFolderPath: "", path: "/unchanged" },
      { foreignAuthorId: "fa-2", titleSlug: "s2" }
    );

    const buildPath = (author: Author) => `/computed/${author.id}`;

    const result = service.updateAuthors([a, b], false, buildPath);

    expect(result.find((x) => x.id === a.id)?.path).toBe(`/computed/${a.id}`);
    expect(result.find((x) => x.id === b.id)?.path).toBe("/unchanged");
    expect(authorRepo.get(a.id).path).toBe(`/computed/${a.id}`);
    expect(authorRepo.get(b.id).path).toBe("/unchanged");
  });

  describe("inexact-match search (findByNameInexact / getCandidates / getReportCandidates)", () => {
    it("findByNameInexact returns the single exact-scoring match", () => {
      const exactMatcher = new ExactOnlyTextMatcher();
      const svc = new AuthorService(authorRepo, events, exactMatcher);

      insertAuthorWithMetadata(
        {},
        { foreignAuthorId: "fa-1", titleSlug: "s1", name: "Exact Name" }
      );
      insertAuthorWithMetadata(
        { cleanName: "other" },
        { foreignAuthorId: "fa-2", titleSlug: "s2", name: "Other Name" }
      );

      const found = svc.findByNameInexact("Exact Name");
      expect(found?.metadata?.name).toBe("Exact Name");
    });

    it("findByNameInexact returns undefined when nothing scores above threshold", () => {
      const svc = new AuthorService(authorRepo, events, new NullTextMatcher());
      insertAuthorWithMetadata();

      expect(svc.findByNameInexact("Anything")).toBeUndefined();
    });

    it("getCandidates/getReportCandidates return distinct-by-id results across scoring functions", () => {
      const exactMatcher = new ExactOnlyTextMatcher();
      const svc = new AuthorService(authorRepo, events, exactMatcher);

      insertAuthorWithMetadata(
        {},
        { foreignAuthorId: "fa-1", titleSlug: "s1", name: "Match Me", nameLastFirst: "Match Me" }
      );

      const candidates = svc.getCandidates("Match Me");
      // Both scoring functions (name, nameLastFirst) match the same author --
      // distinctById should collapse to one entry, not two.
      expect(candidates).toHaveLength(1);

      const reportCandidates = svc.getReportCandidates("Match Me");
      expect(reportCandidates).toHaveLength(1);
    });
  });
});

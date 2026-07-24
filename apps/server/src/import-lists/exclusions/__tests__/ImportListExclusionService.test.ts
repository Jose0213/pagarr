import { describe, expect, it } from "vitest";
import type { IImportListExclusionRepository } from "../ImportListExclusionRepository.js";
import { ImportListExclusionService } from "../ImportListExclusionService.js";
import { createImportListExclusion, type ImportListExclusion } from "../ImportListExclusion.js";
import { AuthorDeletedEvent, BookDeletedEvent } from "../../../books/events.js";
import { newAuthor, newAuthorMetadata, newBook } from "../../../books/models.js";
import type { Author, AuthorMetadata, Book } from "../../../books/models.js";

/**
 * Translated from NzbDrone.Core.Test/ImportListTests/ImportListExclusionServiceFixture.cs.
 */
function inMemoryRepository(): IImportListExclusionRepository & {
  store: Map<number, ImportListExclusion>;
} {
  const store = new Map<number, ImportListExclusion>();
  let nextId = 1;

  return {
    store,
    all: () => [...store.values()],
    find: (id) => store.get(id),
    get: (id) => {
      const found = store.get(id);
      if (!found) throw new Error("not found");
      return found;
    },
    insert: (model) => {
      const withId = { ...model, id: nextId++ };
      store.set(withId.id, withId);
      return withId;
    },
    update: (model) => {
      store.set(model.id, model);
      return model;
    },
    delete: (id) => {
      store.delete(id);
    },
    findByForeignId: (foreignId) => [...store.values()].find((s) => s.foreignId === foreignId),
    findByForeignIds: (foreignIds) =>
      [...store.values()].filter((s) => foreignIds.includes(s.foreignId)),
  };
}

function authorWithMetadata(overrides: Partial<AuthorMetadata> = {}): Author {
  const metadata: AuthorMetadata = { ...newAuthorMetadata(), id: 1, ...overrides };
  return { ...newAuthor(), id: 1, metadata };
}

function bookWithAuthorMetadata(overrides: Partial<AuthorMetadata> = {}): Book {
  const authorMetadata: AuthorMetadata = { ...newAuthorMetadata(), id: 1, ...overrides };
  return { ...newBook(), id: 1, authorMetadata };
}

describe("ImportListExclusionService", () => {
  it("add inserts an exclusion via the repository", () => {
    const repo = inMemoryRepository();
    const service = new ImportListExclusionService(repo);

    const result = service.add(createImportListExclusion({ foreignId: "gr-1", name: "A" }));

    expect(result.id).toBeGreaterThan(0);
    expect(repo.all()).toHaveLength(1);
  });

  it("deleteByForeignId deletes the matching exclusion, no-op if not found", () => {
    const repo = inMemoryRepository();
    const service = new ImportListExclusionService(repo);
    service.add(createImportListExclusion({ foreignId: "gr-1", name: "A" }));

    service.deleteByForeignId("gr-1");
    expect(repo.all()).toHaveLength(0);

    // No throw for a foreignId that doesn't exist.
    expect(() => service.deleteByForeignId("gr-missing")).not.toThrow();
  });

  describe("handleAuthorDeleted", () => {
    it("does nothing when addImportListExclusion is false", () => {
      const repo = inMemoryRepository();
      const service = new ImportListExclusionService(repo);

      service.handleAuthorDeleted(
        new AuthorDeletedEvent(authorWithMetadata({ foreignAuthorId: "gr-a1" }), false, false)
      );

      expect(repo.all()).toHaveLength(0);
    });

    it("adds an exclusion using the author's ForeignAuthorId/Name when addImportListExclusion is true", () => {
      const repo = inMemoryRepository();
      const service = new ImportListExclusionService(repo);

      service.handleAuthorDeleted(
        new AuthorDeletedEvent(
          authorWithMetadata({ foreignAuthorId: "gr-a1", name: "Brandon Sanderson" }),
          false,
          true
        )
      );

      const all = repo.all();
      expect(all).toHaveLength(1);
      expect(all[0]?.foreignId).toBe("gr-a1");
      expect(all[0]?.name).toBe("Brandon Sanderson");
    });

    it("does not add a duplicate exclusion if one with the same ForeignId already exists", () => {
      const repo = inMemoryRepository();
      const service = new ImportListExclusionService(repo);
      service.add(createImportListExclusion({ foreignId: "gr-a1", name: "Existing" }));

      service.handleAuthorDeleted(
        new AuthorDeletedEvent(authorWithMetadata({ foreignAuthorId: "gr-a1" }), false, true)
      );

      expect(repo.all()).toHaveLength(1);
      expect(repo.all()[0]?.name).toBe("Existing");
    });
  });

  describe("handleBookDeleted", () => {
    it("does nothing when addImportListExclusion is false", () => {
      const repo = inMemoryRepository();
      const service = new ImportListExclusionService(repo);

      service.handleBookDeleted(new BookDeletedEvent(bookWithAuthorMetadata(), false, false));

      expect(repo.all()).toHaveLength(0);
    });

    it("adds an exclusion using '{AuthorName} - {BookTitle}' when addImportListExclusion is true", () => {
      const repo = inMemoryRepository();
      const service = new ImportListExclusionService(repo);
      const book: Book = {
        ...bookWithAuthorMetadata({ name: "Brandon Sanderson" }),
        foreignBookId: "gr-b1",
        title: "The Way of Kings",
      };

      service.handleBookDeleted(new BookDeletedEvent(book, false, true));

      const all = repo.all();
      expect(all).toHaveLength(1);
      expect(all[0]?.foreignId).toBe("gr-b1");
      expect(all[0]?.name).toBe("Brandon Sanderson - The Way of Kings");
    });

    it("does not add a duplicate exclusion if one with the same ForeignId already exists", () => {
      const repo = inMemoryRepository();
      const service = new ImportListExclusionService(repo);
      repo.insert(createImportListExclusion({ foreignId: "gr-b1", name: "Existing" }));

      const book: Book = { ...bookWithAuthorMetadata(), foreignBookId: "gr-b1" };
      service.handleBookDeleted(new BookDeletedEvent(book, false, true));

      expect(repo.all()).toHaveLength(1);
      expect(repo.all()[0]?.name).toBe("Existing");
    });
  });
});

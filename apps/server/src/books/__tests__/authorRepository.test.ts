import { describe, expect, it, afterEach, beforeEach } from "vitest";
import { createTestDatabase } from "./testDb.js";
import { AuthorRepository } from "../authorRepository.js";
import { AuthorMetadataRepository } from "../authorMetadataRepository.js";
import type { MainDatabase } from "../../db/db-factory.js";
import { NewItemMonitorTypes, newAuthor, newAuthorMetadata, type Author } from "../models.js";

describe("AuthorRepository", () => {
  let db: MainDatabase;
  let repo: AuthorRepository;
  let metaRepo: AuthorMetadataRepository;

  beforeEach(() => {
    db = createTestDatabase();
    repo = new AuthorRepository(db);
    metaRepo = new AuthorMetadataRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  function insertAuthorWithMetadata(
    overrides: Partial<Author> = {},
    metaOverrides: Record<string, unknown> = {}
  ) {
    const meta = metaRepo.insert({
      ...newAuthorMetadata(),
      foreignAuthorId: "fa-1",
      titleSlug: "author-one",
      name: "Author One",
      ...metaOverrides,
    });

    return repo.insert({
      ...newAuthor(),
      authorMetadataId: meta.id,
      cleanName: "authorone",
      path: "/books/Author One",
      monitored: true,
      monitorNewItems: NewItemMonitorTypes.All,
      ...overrides,
    });
  }

  it("inserts and retrieves a row round-trip via the base repository", () => {
    const inserted = insertAuthorWithMetadata();
    const fetched = repo.get(inserted.id);

    expect(fetched.cleanName).toBe("authorone");
    expect(fetched.path).toBe("/books/Author One");
    expect(fetched.monitored).toBe(true);
    // Base find()/get() don't join AuthorMetadata -- see module doc comment.
    expect(fetched.metadata).toBeUndefined();
  });

  it("rootFolderPath is never persisted (not a real DB column)", () => {
    const inserted = insertAuthorWithMetadata({ rootFolderPath: "/books" });
    const fetched = repo.get(inserted.id);
    expect(fetched.rootFolderPath).toBe("");
  });

  describe("authorPathExists", () => {
    it("returns true only for an exact path match", () => {
      insertAuthorWithMetadata({ path: "/books/Author One" });

      expect(repo.authorPathExists("/books/Author One")).toBe(true);
      expect(repo.authorPathExists("/books/Nope")).toBe(false);
    });
  });

  describe("findById", () => {
    it("finds an author by ForeignAuthorId, with metadata populated", () => {
      const inserted = insertAuthorWithMetadata({}, { foreignAuthorId: "fa-42" });

      const found = repo.findById("fa-42");
      expect(found?.id).toBe(inserted.id);
      expect(found?.metadata?.foreignAuthorId).toBe("fa-42");
      expect(found?.metadata?.name).toBe("Author One");
    });

    it("returns undefined when no author matches", () => {
      expect(repo.findById("missing")).toBeUndefined();
    });
  });

  describe("findByName", () => {
    it("returns the single match for a clean name", () => {
      insertAuthorWithMetadata({ cleanName: "uniquename" });

      const found = repo.findByName("UniqueName");
      expect(found?.cleanName).toBe("uniquename");
    });

    it("returns undefined when zero authors match", () => {
      expect(repo.findByName("nobody")).toBeUndefined();
    });

    it("returns undefined (ExclusiveOrDefault semantics) when more than one author matches", () => {
      const meta2 = metaRepo.insert({
        ...newAuthorMetadata(),
        foreignAuthorId: "fa-dupe-2",
        titleSlug: "dupe-two",
        name: "Dupe Two",
      });
      insertAuthorWithMetadata(
        { cleanName: "dupename" },
        { foreignAuthorId: "fa-dupe-1", titleSlug: "dupe-one" }
      );
      repo.insert({
        ...newAuthor(),
        authorMetadataId: meta2.id,
        cleanName: "dupename",
        path: "/books/Dupe Two",
      });

      expect(repo.findByName("dupename")).toBeUndefined();
    });
  });

  it("allAuthorPaths returns every author's id -> path", () => {
    const a = insertAuthorWithMetadata(
      { path: "/books/A" },
      { foreignAuthorId: "fa-a", titleSlug: "a" }
    );
    const meta2 = metaRepo.insert({
      ...newAuthorMetadata(),
      foreignAuthorId: "fa-b",
      titleSlug: "b",
      name: "B",
    });
    const b = repo.insert({
      ...newAuthor(),
      authorMetadataId: meta2.id,
      cleanName: "b",
      path: "/books/B",
    });

    const paths = repo.allAuthorPaths();
    expect(paths.get(a.id)).toBe("/books/A");
    expect(paths.get(b.id)).toBe("/books/B");
  });

  describe("allAuthorTags", () => {
    it("only includes authors with a non-null Tags column", () => {
      const withTags = insertAuthorWithMetadata(
        { tags: [1, 2] },
        { foreignAuthorId: "fa-tags", titleSlug: "tags" }
      );

      const tags = repo.allAuthorTags();
      expect(tags.get(withTags.id)).toEqual([1, 2]);
    });
  });

  it("getAuthorByMetadataId finds the author linked to a given metadata id, with metadata populated", () => {
    const meta = metaRepo.insert({
      ...newAuthorMetadata(),
      foreignAuthorId: "fa-x",
      titleSlug: "x",
      name: "X",
    });
    const author = repo.insert({
      ...newAuthor(),
      authorMetadataId: meta.id,
      cleanName: "x",
      path: "/books/X",
    });

    const found = repo.getAuthorByMetadataId(meta.id);
    expect(found?.id).toBe(author.id);
    expect(found?.metadata?.name).toBe("X");

    expect(repo.getAuthorByMetadataId(99999)).toBeUndefined();
  });

  it("getAuthorsByMetadataId returns all matching authors, with metadata populated", () => {
    const meta1 = metaRepo.insert({
      ...newAuthorMetadata(),
      foreignAuthorId: "fa-1",
      titleSlug: "one",
      name: "One",
    });
    const meta2 = metaRepo.insert({
      ...newAuthorMetadata(),
      foreignAuthorId: "fa-2",
      titleSlug: "two",
      name: "Two",
    });
    const a1 = repo.insert({
      ...newAuthor(),
      authorMetadataId: meta1.id,
      cleanName: "one",
      path: "/books/One",
    });
    const a2 = repo.insert({
      ...newAuthor(),
      authorMetadataId: meta2.id,
      cleanName: "two",
      path: "/books/Two",
    });

    const found = repo.getAuthorsByMetadataId([meta1.id, meta2.id]);
    expect(found.map((a) => a.id).sort()).toEqual([a1.id, a2.id].sort());
    expect(found.every((a) => a.metadata !== undefined)).toBe(true);

    expect(repo.getAuthorsByMetadataId([])).toEqual([]);
  });

  it("allWithMetadata returns every author with metadata populated", () => {
    insertAuthorWithMetadata({}, { foreignAuthorId: "fa-1", titleSlug: "one" });
    const meta2 = metaRepo.insert({
      ...newAuthorMetadata(),
      foreignAuthorId: "fa-2",
      titleSlug: "two",
      name: "Two",
    });
    repo.insert({
      ...newAuthor(),
      authorMetadataId: meta2.id,
      cleanName: "two",
      path: "/books/Two",
    });

    const all = repo.allWithMetadata();
    expect(all).toHaveLength(2);
    expect(all.every((a) => a.metadata !== undefined)).toBe(true);
  });
});

import { describe, expect, it, afterEach } from "vitest";
import { createTestDatabase } from "./testDb.js";
import { AuthorMetadataRepository } from "../authorMetadataRepository.js";
import type { MainDatabase } from "../../db/db-factory.js";
import { AuthorStatusType, newAuthorMetadata, type AuthorMetadata } from "../models.js";

function metadata(overrides: Partial<AuthorMetadata> = {}): AuthorMetadata {
  return {
    ...newAuthorMetadata(),
    foreignAuthorId: "fa-1",
    titleSlug: "author-one",
    name: "Author One",
    ...overrides,
  };
}

describe("AuthorMetadataRepository", () => {
  let db: MainDatabase;
  let repo: AuthorMetadataRepository;

  afterEach(() => {
    db?.close();
  });

  function setup() {
    db = createTestDatabase();
    repo = new AuthorMetadataRepository(db);
  }

  it("inserts and retrieves a row round-trip", () => {
    setup();
    const inserted = repo.insert(metadata());

    expect(inserted.id).toBeGreaterThan(0);
    const fetched = repo.get(inserted.id);
    expect(fetched.name).toBe("Author One");
    expect(fetched.foreignAuthorId).toBe("fa-1");
    expect(fetched.aliases).toEqual([]);
    expect(fetched.images).toEqual([]);
    expect(fetched.ratings).toEqual({ votes: 0, value: 0 });
    expect(fetched.status).toBe(AuthorStatusType.Continuing);
  });

  it("round-trips embedded JSON fields (links, genres, ratings, images)", () => {
    setup();
    const inserted = repo.insert(
      metadata({
        links: [{ url: "https://example.com", name: "Website" }],
        genres: ["Fantasy", "Sci-Fi"],
        ratings: { votes: 10, value: 4.5 },
        images: [{ coverType: "poster", url: "https://example.com/a.jpg" }],
        aliases: ["A. One"],
      })
    );

    const fetched = repo.get(inserted.id);
    expect(fetched.links).toEqual([{ url: "https://example.com", name: "Website" }]);
    expect(fetched.genres).toEqual(["Fantasy", "Sci-Fi"]);
    expect(fetched.ratings).toEqual({ votes: 10, value: 4.5 });
    expect(fetched.images).toEqual([{ coverType: "poster", url: "https://example.com/a.jpg" }]);
    expect(fetched.aliases).toEqual(["A. One"]);
  });

  describe("findById", () => {
    it("returns matching rows by ForeignAuthorId", () => {
      setup();
      repo.insert(metadata({ foreignAuthorId: "fa-1" }));
      repo.insert(metadata({ foreignAuthorId: "fa-2", titleSlug: "author-two" }));
      repo.insert(metadata({ foreignAuthorId: "fa-3", titleSlug: "author-three" }));

      const results = repo.findById(["fa-1", "fa-3", "fa-missing"]);
      expect(results).toHaveLength(2);
      expect(results.map((r) => r.foreignAuthorId).sort()).toEqual(["fa-1", "fa-3"]);
    });

    it("returns an empty array for an empty id list", () => {
      setup();
      expect(repo.findById([])).toEqual([]);
    });
  });

  describe("upsertMany", () => {
    it("inserts brand-new records and returns true", () => {
      setup();
      const changed = repo.upsertMany([
        metadata({ foreignAuthorId: "fa-1" }),
        metadata({ foreignAuthorId: "fa-2", titleSlug: "author-two" }),
      ]);

      expect(changed).toBe(true);
      expect(repo.count()).toBe(2);
    });

    it("updates an existing record only when it actually differs", () => {
      setup();
      const inserted = repo.insert(metadata({ foreignAuthorId: "fa-1", name: "Old Name" }));

      const changed = repo.upsertMany([metadata({ foreignAuthorId: "fa-1", name: "New Name" })]);

      expect(changed).toBe(true);
      expect(repo.get(inserted.id).name).toBe("New Name");
      expect(repo.count()).toBe(1);
    });

    it("returns false and makes no changes when incoming data is identical to stored data", () => {
      setup();
      const existing = metadata({ foreignAuthorId: "fa-1", name: "Same Name" });
      const inserted = repo.insert(existing);

      const changed = repo.upsertMany([{ ...existing, id: 0 }]);

      expect(changed).toBe(false);
      expect(repo.get(inserted.id).name).toBe("Same Name");
      expect(repo.count()).toBe(1);
    });

    it("handles a mix of new and existing records in one call", () => {
      setup();
      repo.insert(metadata({ foreignAuthorId: "fa-1", name: "Existing" }));

      const changed = repo.upsertMany([
        metadata({ foreignAuthorId: "fa-1", name: "Existing Updated" }),
        metadata({ foreignAuthorId: "fa-2", titleSlug: "author-two", name: "Brand New" }),
      ]);

      expect(changed).toBe(true);
      expect(repo.count()).toBe(2);
      const all = repo.all();
      expect(all.find((a) => a.foreignAuthorId === "fa-1")?.name).toBe("Existing Updated");
      expect(all.find((a) => a.foreignAuthorId === "fa-2")?.name).toBe("Brand New");
    });
  });

  /**
   * Regression coverage for the singular upsert() double-serialization
   * bugfix -- see bookRepository.test.ts's identical describe block for the
   * full explanation. NOTE: this is distinct from upsertMany() above, which
   * routes through this class's own already-correct insertMany()/
   * updateMany() overrides and was never affected by this bug.
   */
  describe("upsert", () => {
    it("insert-branch (id 0): stores JSON-embedded columns single-encoded, not double-encoded", () => {
      setup();

      const upserted = repo.upsert(metadata({ genres: ["Fantasy", "Sci-Fi"] }));

      expect(upserted.id).toBeGreaterThan(0);
      expect(upserted.genres).toEqual(["Fantasy", "Sci-Fi"]);

      const conn = db.openConnection();
      const row = conn
        .prepare('SELECT "Genres" FROM "AuthorMetadata" WHERE "Id" = ?')
        .get(upserted.id) as { Genres: string };
      expect(JSON.parse(row.Genres)).toEqual(["Fantasy", "Sci-Fi"]);

      const fetched = repo.get(upserted.id);
      expect(fetched.genres).toEqual(["Fantasy", "Sci-Fi"]);
    });

    it("update-branch (id != 0): stores JSON-embedded columns single-encoded, not double-encoded", () => {
      setup();
      const existing = repo.insert(metadata({ genres: ["Old"] }));

      const upserted = repo.upsert({ ...existing, genres: ["New", "Genres"] });

      expect(upserted.id).toBe(existing.id);
      expect(upserted.genres).toEqual(["New", "Genres"]);

      const conn = db.openConnection();
      const row = conn
        .prepare('SELECT "Genres" FROM "AuthorMetadata" WHERE "Id" = ?')
        .get(existing.id) as { Genres: string };
      expect(JSON.parse(row.Genres)).toEqual(["New", "Genres"]);

      const fetched = repo.get(existing.id);
      expect(fetched.genres).toEqual(["New", "Genres"]);
    });
  });
});

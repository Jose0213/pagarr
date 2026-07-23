import { beforeEach, describe, expect, it } from "vitest";
import type { IDatabase } from "../../db/database.js";
import { createDatabase, DEFAULT_MAIN_MIGRATIONS_DIR } from "../../db/db-factory.js";
import { TagRepository } from "../tagRepository.js";
import type { Tag } from "../tag.js";

function makeRepo(): { db: IDatabase; repo: TagRepository } {
  const db = createDatabase("Test", {
    path: ":memory:",
    migrationsDir: DEFAULT_MAIN_MIGRATIONS_DIR,
  });
  return { db, repo: new TagRepository(db) };
}

describe("TagRepository", () => {
  let repo: TagRepository;

  beforeEach(() => {
    ({ repo } = makeRepo());
  });

  describe("insert/all (BasicRepository<Tag> CRUD against the real Tags table)", () => {
    it("inserts a tag and assigns an id", () => {
      const inserted = repo.insert({ id: 0, label: "sci-fi" });

      expect(inserted.id).toBeGreaterThan(0);
      expect(repo.get(inserted.id)).toEqual(inserted);
    });

    it("all() returns every inserted tag", () => {
      repo.insert({ id: 0, label: "sci-fi" });
      repo.insert({ id: 0, label: "fantasy" });

      expect(
        repo
          .all()
          .map((t) => t.label)
          .sort()
      ).toEqual(["fantasy", "sci-fi"]);
    });

    it("Label column is UNIQUE (matches migration 0001's Tags table)", () => {
      repo.insert({ id: 0, label: "sci-fi" });

      expect(() => repo.insert({ id: 0, label: "sci-fi" })).toThrow();
    });
  });

  describe("getByLabel", () => {
    it("returns the matching tag", () => {
      const inserted = repo.insert({ id: 0, label: "sci-fi" });

      expect(repo.getByLabel("sci-fi")).toEqual(inserted);
    });

    it("throws with the C#-ported message when no tag has that label", () => {
      expect(() => repo.getByLabel("missing")).toThrow("Didn't find tag with label missing");
    });
  });

  describe("findByLabel", () => {
    it("returns the matching tag", () => {
      const inserted = repo.insert({ id: 0, label: "sci-fi" });

      expect(repo.findByLabel("sci-fi")).toEqual(inserted);
    });

    it("returns undefined (C#'s null) when no tag has that label", () => {
      expect(repo.findByLabel("missing")).toBeUndefined();
    });
  });

  describe("delete", () => {
    it("removes the tag", () => {
      const inserted = repo.insert({ id: 0, label: "sci-fi" });

      repo.delete(inserted.id);

      expect(repo.find(inserted.id)).toBeUndefined();
    });
  });
});

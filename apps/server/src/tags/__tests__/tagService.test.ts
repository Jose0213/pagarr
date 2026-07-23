import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDatabase, DEFAULT_MAIN_MIGRATIONS_DIR } from "../../db/db-factory.js";
import { ModelConflictException } from "../../db/errors.js";
import { TagRepository } from "../tagRepository.js";
import { TagService, type TagUsageProvider } from "../tagService.js";
import type { Tag } from "../tag.js";

function makeService(onTagsUpdated?: () => void): { repo: TagRepository; service: TagService } {
  const db = createDatabase("Test", { path: ":memory:", migrationsDir: DEFAULT_MAIN_MIGRATIONS_DIR });
  const repo = new TagRepository(db);
  const service = new TagService(repo, {}, onTagsUpdated);
  return { repo, service };
}

describe("TagService", () => {
  let repo: TagRepository;
  let service: TagService;

  beforeEach(() => {
    ({ repo, service } = makeService());
  });

  describe("all", () => {
    it("returns tags ordered by label (TagService.All: _repo.All().OrderBy(t => t.Label))", () => {
      repo.insert({ id: 0, label: "zebra" } as Tag);
      repo.insert({ id: 0, label: "alpha" } as Tag);
      repo.insert({ id: 0, label: "mid" } as Tag);

      expect(service.all().map((t) => t.label)).toEqual(["alpha", "mid", "zebra"]);
    });
  });

  describe("getTag", () => {
    it("looks up by numeric id when given a number", () => {
      const inserted = repo.insert({ id: 0, label: "sci-fi" } as Tag);

      expect(service.getTag(inserted.id)).toEqual(inserted);
    });

    it("looks up by id when given an all-digit string (tag.All(char.IsDigit))", () => {
      const inserted = repo.insert({ id: 0, label: "sci-fi" } as Tag);

      expect(service.getTag(String(inserted.id))).toEqual(inserted);
    });

    it("looks up by label when given a non-numeric string", () => {
      const inserted = repo.insert({ id: 0, label: "sci-fi" } as Tag);

      expect(service.getTag("sci-fi")).toEqual(inserted);
    });

    it("throws for an unknown numeric id", () => {
      expect(() => service.getTag(999)).toThrow();
    });

    it("throws for an unknown label", () => {
      expect(() => service.getTag("missing")).toThrow("Didn't find tag with label missing");
    });

    it("throws for an empty string (matches C#'s vacuous-true All(char.IsDigit) -> int.Parse('') edge case)", () => {
      expect(() => service.getTag("")).toThrow();
    });
  });

  describe("add", () => {
    it("inserts a new tag lower-cased and fires onTagsUpdated", () => {
      const onTagsUpdated = vi.fn();
      ({ repo, service } = makeService(onTagsUpdated));

      const result = service.add({ id: 0, label: "Sci-Fi" } as Tag);

      expect(result.label).toBe("sci-fi");
      expect(result.id).toBeGreaterThan(0);
      expect(onTagsUpdated).toHaveBeenCalledOnce();
    });

    it("returns the existing tag unchanged when the label already exists, without inserting a duplicate", () => {
      const onTagsUpdated = vi.fn();
      ({ repo, service } = makeService(onTagsUpdated));
      const seeded = repo.insert({ id: 0, label: "sci-fi" } as Tag);

      const result = service.add({ id: 0, label: "sci-fi" } as Tag);

      expect(result).toEqual(seeded);
      expect(repo.all()).toHaveLength(1);
      expect(onTagsUpdated).not.toHaveBeenCalled();
    });
  });

  describe("update", () => {
    it("lower-cases the label and persists, firing onTagsUpdated", () => {
      const onTagsUpdated = vi.fn();
      ({ repo, service } = makeService(onTagsUpdated));
      const seeded = repo.insert({ id: 0, label: "sci-fi" } as Tag);

      const result = service.update({ ...seeded, label: "Fantasy" });

      expect(result.label).toBe("fantasy");
      expect(repo.get(seeded.id).label).toBe("fantasy");
      expect(onTagsUpdated).toHaveBeenCalledOnce();
    });
  });

  describe("details / detailsAll", () => {
    it("aggregates ids from every injected usage provider", () => {
      const tag = repo.insert({ id: 0, label: "sci-fi" } as Tag);
      const authors: TagUsageProvider = { allForTag: () => [{ id: 1 }, { id: 2 }] };
      const rootFolders: TagUsageProvider = { allForTag: () => [{ id: 10 }] };
      const svc = new TagService(repo, { authors, rootFolders });

      const details = svc.details(tag.id);

      expect(details.label).toBe("sci-fi");
      expect(details.authorIds).toEqual([1, 2]);
      expect(details.rootFolderIds).toEqual([10]);
      expect(details.notificationIds).toEqual([]);
      expect(details.delayProfileIds).toEqual([]);
      expect(details.importListIds).toEqual([]);
      expect(details.indexerIds).toEqual([]);
      expect(details.downloadClientIds).toEqual([]);
      expect(details.restrictionIds).toEqual([]);
    });

    it("omitted providers report empty (tag is never 'in use' with zero providers wired up)", () => {
      const tag = repo.insert({ id: 0, label: "sci-fi" } as Tag);

      const details = service.details(tag.id);

      expect(details.authorIds).toEqual([]);
      expect(details.notificationIds).toEqual([]);
    });

    it("detailsAll returns details for every tag, in label order", () => {
      repo.insert({ id: 0, label: "zebra" } as Tag);
      repo.insert({ id: 0, label: "alpha" } as Tag);
      repo.insert({ id: 0, label: "sci-fi" } as Tag);

      const all = service.detailsAll();

      expect(all.map((d) => d.label)).toEqual(["alpha", "sci-fi", "zebra"]);
    });
  });

  describe("delete", () => {
    it("deletes an unused tag and fires onTagsUpdated", () => {
      const onTagsUpdated = vi.fn();
      ({ repo, service } = makeService(onTagsUpdated));
      const seeded = repo.insert({ id: 0, label: "sci-fi" } as Tag);

      service.delete(seeded.id);

      expect(repo.find(seeded.id)).toBeUndefined();
      expect(onTagsUpdated).toHaveBeenCalledOnce();
    });

    it("refuses to delete a tag still in use, throwing ModelConflictException with the C#-ported message", () => {
      const tag = repo.insert({ id: 0, label: "sci-fi" } as Tag);
      const authors: TagUsageProvider = { allForTag: () => [{ id: 1 }] };
      const svc = new TagService(repo, { authors });

      expect(() => svc.delete(tag.id)).toThrow(ModelConflictException);
      expect(() => svc.delete(tag.id)).toThrow(
        `Tag with ID ${tag.id} 'sci-fi' cannot be deleted since it's still in use`,
      );
      expect(repo.find(tag.id)).toBeDefined();
    });
  });
});

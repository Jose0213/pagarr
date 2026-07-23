import { describe, expect, it, vi } from "vitest";
import { QualityProfileInUseException } from "../errors.js";
import { newQualityProfile } from "../qualities/qualityProfile.js";
import {
  QualityProfileService,
  type AuthorProfileUsageLookup,
  type ImportListProfileUsageLookup,
  type RootFolderProfileUsageLookup,
} from "../qualities/qualityProfileService.js";
import type { QualityProfileRepository } from "../qualities/qualityProfileRepository.js";

function makeRepo(overrides: Partial<QualityProfileRepository> = {}): QualityProfileRepository {
  return {
    all: vi.fn(() => []),
    get: vi.fn(),
    find: vi.fn(),
    insert: vi.fn((p) => ({ ...p, id: 1 })),
    update: vi.fn((p) => p),
    delete: vi.fn(),
    exists: vi.fn(() => false),
    count: vi.fn(() => 0),
    ...overrides,
  } as unknown as QualityProfileRepository;
}

/** Ported from NzbDrone.Core.Test/Profiles/QualityProfileServiceFixture.cs. */
describe("QualityProfileService", () => {
  describe("handleApplicationStarted", () => {
    it("init_should_add_default_profiles: inserts exactly 2 default profiles when none exist", () => {
      const insert = vi.fn((p: ReturnType<typeof newQualityProfile>) => ({ ...p, id: 1 }));
      const repo = makeRepo({ all: vi.fn(() => []), insert });

      const service = new QualityProfileService(repo);
      service.handleApplicationStarted();

      expect(insert).toHaveBeenCalledTimes(2);
    });

    it("Init_should_skip_if_any_profiles_already_exist", () => {
      const insert = vi.fn();
      const repo = makeRepo({
        all: vi.fn(() => [newQualityProfile({ id: 1 }), newQualityProfile({ id: 2 })]),
        insert,
      });

      const service = new QualityProfileService(repo);
      service.handleApplicationStarted();

      expect(insert).not.toHaveBeenCalled();
    });
  });

  describe("delete", () => {
    const profile = newQualityProfile({ id: 2, name: "InUse" });

    it("should_not_be_able_to_delete_profile_if_assigned_to_author", () => {
      const repo = makeRepo({ get: vi.fn(() => profile) });
      const authorService: AuthorProfileUsageLookup = {
        getAllAuthors: () => [{ qualityProfileId: profile.id }],
      };

      const service = new QualityProfileService(repo, { authorService });

      expect(() => service.delete(profile.id)).toThrow(QualityProfileInUseException);
      expect(repo.delete).not.toHaveBeenCalled();
    });

    it("should_not_be_able_to_delete_profile_if_assigned_to_import_list", () => {
      const repo = makeRepo({ get: vi.fn(() => profile) });
      const importListFactory: ImportListProfileUsageLookup = {
        all: () => [{ profileId: profile.id }],
      };

      const service = new QualityProfileService(repo, { importListFactory });

      expect(() => service.delete(profile.id)).toThrow(QualityProfileInUseException);
      expect(repo.delete).not.toHaveBeenCalled();
    });

    it("should_not_be_able_to_delete_profile_if_assigned_to_root_folder", () => {
      const repo = makeRepo({ get: vi.fn(() => profile) });
      const rootFolderService: RootFolderProfileUsageLookup = {
        all: () => [{ defaultQualityProfileId: profile.id }],
      };

      const service = new QualityProfileService(repo, { rootFolderService });

      expect(() => service.delete(profile.id)).toThrow(QualityProfileInUseException);
      expect(repo.delete).not.toHaveBeenCalled();
    });

    it("should_delete_profile_if_not_assigned_to_author_import_list_or_root_folder", () => {
      const repo = makeRepo();
      const service = new QualityProfileService(repo, {
        authorService: { getAllAuthors: () => [{ qualityProfileId: 2 }] },
        importListFactory: { all: () => [{ profileId: 2 }] },
        rootFolderService: { all: () => [{ defaultQualityProfileId: 2 }] },
      });

      service.delete(1);

      expect(repo.delete).toHaveBeenCalledWith(1);
    });
  });

  describe("getDefaultProfile", () => {
    it("marks the given allowed qualities as allowed and everything else as not allowed", () => {
      const repo = makeRepo();
      const service = new QualityProfileService(repo);

      const MOBI = { id: 2, name: "MOBI" };
      const EPUB = { id: 3, name: "EPUB" };
      const AZW3 = { id: 4, name: "AZW3" };

      const profile = service.getDefaultProfile("eBook", MOBI, MOBI, EPUB, AZW3);

      expect(profile.name).toBe("eBook");
      expect(profile.cutoff).toBe(MOBI.id);

      const allowedQualityIds = profile.items
        .filter((i) => i.allowed)
        .map((i) => i.quality?.id)
        .filter((id): id is number => id !== undefined);

      expect(allowedQualityIds.sort()).toEqual([2, 3, 4]);

      const disallowed = profile.items.filter((i) => !i.allowed);
      expect(disallowed.length).toBeGreaterThan(0);
    });

    it("defaults cutoff to Unknown (id 0) when no cutoff quality is given", () => {
      const repo = makeRepo();
      const service = new QualityProfileService(repo);

      const profile = service.getDefaultProfile("Empty");
      expect(profile.cutoff).toBe(0);
    });

    it("includes a zero-score FormatItem for every registered CustomFormat", () => {
      const repo = makeRepo();
      const customFormatService = { all: () => [{ id: 1, name: "A" }, { id: 2, name: "B" }] };
      const service = new QualityProfileService(repo, { customFormatService });

      const profile = service.getDefaultProfile("WithFormats");
      expect(profile.formatItems).toEqual([
        { format: { id: 1, name: "A" }, score: 0 },
        { format: { id: 2, name: "B" }, score: 0 },
      ]);
    });
  });

  describe("customFormat event handlers", () => {
    it("handleCustomFormatAdded prepends a zero-score FormatItem to every profile", () => {
      const existing = newQualityProfile({ id: 1, formatItems: [{ format: { id: 9, name: "Old" }, score: 5 }] });
      const update = vi.fn();
      const repo = makeRepo({ all: vi.fn(() => [existing]), update });

      const service = new QualityProfileService(repo);
      service.handleCustomFormatAdded({ id: 42, name: "New" });

      expect(update).toHaveBeenCalledTimes(1);
      const updated = update.mock.calls[0]?.[0];
      expect(updated.formatItems[0]).toEqual({ score: 0, format: { id: 42, name: "New" } });
      expect(updated.formatItems).toHaveLength(2);
    });

    it("handleCustomFormatDeleted removes the format and resets scores if none remain", () => {
      const format = { id: 9, name: "Old" };
      const existing = newQualityProfile({
        id: 1,
        formatItems: [{ format, score: 5 }],
        minFormatScore: 10,
        cutoffFormatScore: 20,
      });
      const update = vi.fn();
      const repo = makeRepo({ all: vi.fn(() => [existing]), update });

      const service = new QualityProfileService(repo);
      service.handleCustomFormatDeleted(format);

      const updated = update.mock.calls[0]?.[0];
      expect(updated.formatItems).toEqual([]);
      expect(updated.minFormatScore).toBe(0);
      expect(updated.cutoffFormatScore).toBe(0);
    });
  });
});

import { describe, expect, it, vi } from "vitest";
import { MetadataProfileInUseException } from "../errors.js";
import { newMetadataProfile, type MetadataProfile } from "../metadata/metadataProfile.js";
import {
  MetadataProfileService,
  NONE_PROFILE_NAME,
  type AuthorLookup,
  type ImportListProfileUsageLookup,
  type RootFolderProfileUsageLookup,
} from "../metadata/metadataProfileService.js";
import type { MetadataProfileRepository } from "../metadata/metadataProfileRepository.js";
import { BookAddType, type FilterBook } from "../metadata/bookFiltering.js";
import { TermMatcherService } from "../releases/termMatcherService.js";

function makeRepo(overrides: Partial<MetadataProfileRepository> = {}): MetadataProfileRepository {
  return {
    all: vi.fn(() => []),
    get: vi.fn(),
    find: vi.fn(),
    insert: vi.fn((p: MetadataProfile) => ({ ...p, id: 1 })),
    update: vi.fn((p: MetadataProfile) => p),
    delete: vi.fn(),
    exists: vi.fn(() => false),
    ...overrides,
  } as unknown as MetadataProfileRepository;
}

/** Ported from NzbDrone.Core.Test/Profiles/Metadata/MetadataProfileServiceFixture.cs. */
describe("MetadataProfileService", () => {
  describe("handleApplicationStarted", () => {
    it("init_should_add_default_profiles: inserts exactly 2 (Standard + None) when none exist", () => {
      const insert = vi.fn((p: MetadataProfile) => ({ ...p, id: 1 }));
      const repo = makeRepo({ all: vi.fn(() => []), insert });

      new MetadataProfileService(repo).handleApplicationStarted();

      expect(insert).toHaveBeenCalledTimes(2);
    });

    it("Init_should_skip_if_any_profiles_already_exist: no Standard insert when profiles exist", () => {
      const insert = vi.fn((p: MetadataProfile) => ({ ...p, id: 1 }));
      const repo = makeRepo({
        all: vi.fn(() => [newMetadataProfile({ id: 1 }), newMetadataProfile({ id: 2 })]),
        insert,
      });

      new MetadataProfileService(repo).handleApplicationStarted();

      expect(insert).not.toHaveBeenCalledWith(expect.objectContaining({ name: "Standard" }));
    });

    it("init_should_add_none_profile_if_it_doesnt_exist", () => {
      const insert = vi.fn((p: MetadataProfile) => ({ ...p, id: 1 }));
      const repo = makeRepo({
        all: vi.fn(() => [newMetadataProfile({ id: 1 }), newMetadataProfile({ id: 2 })]),
        insert,
      });

      new MetadataProfileService(repo).handleApplicationStarted();

      expect(insert).toHaveBeenCalledWith(expect.objectContaining({ name: "None" }));
    });

    it("init_should_move_existing_none_profile: renames the pre-existing non-empty 'None' profile to 'None.1'", () => {
      const existingNone = newMetadataProfile({
        id: 10,
        name: NONE_PROFILE_NAME,
        minPopularity: 5,
      });
      const other = newMetadataProfile({ id: 11, name: "Other" });
      const update = vi.fn();
      const insert = vi.fn((p: MetadataProfile) => ({ ...p, id: 99 }));
      const repo = makeRepo({ all: vi.fn(() => [existingNone, other]), update, insert });

      new MetadataProfileService(repo).handleApplicationStarted();

      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({ id: existingNone.id, name: "None.1" })
      );
      expect(insert).toHaveBeenCalledWith(expect.objectContaining({ name: "None" }));
    });
  });

  describe("update", () => {
    it("should_not_be_able_to_edit_none_profile", () => {
      const repo = makeRepo();
      const service = new MetadataProfileService(repo);
      const profile = newMetadataProfile({ name: NONE_PROFILE_NAME });

      expect(() => service.update(profile)).toThrow(/Not permitted to alter None metadata profile/);
    });
  });

  describe("delete", () => {
    it("should_not_be_able_to_delete_none_profile", () => {
      const profile = newMetadataProfile({ id: 1, name: NONE_PROFILE_NAME });
      const repo = makeRepo({ get: vi.fn(() => profile) });
      const service = new MetadataProfileService(repo);

      expect(() => service.delete(profile.id)).toThrow(MetadataProfileInUseException);
    });

    it("should_not_be_able_to_delete_profile_if_assigned_to_author", () => {
      const profile = newMetadataProfile({ id: 2, name: "InUse" });
      const repo = makeRepo({ get: vi.fn(() => profile) });
      const authorService: AuthorLookup = {
        findById: () => undefined,
        getAllAuthors: () => [{ metadataProfileId: profile.id }],
      };

      const service = new MetadataProfileService(repo, { authorService });

      expect(() => service.delete(profile.id)).toThrow(MetadataProfileInUseException);
      expect(repo.delete).not.toHaveBeenCalled();
    });

    it("should_not_be_able_to_delete_profile_if_assigned_to_import_list", () => {
      const profile = newMetadataProfile({ id: 2, name: "InUse" });
      const repo = makeRepo({ get: vi.fn(() => profile) });
      const importListFactory: ImportListProfileUsageLookup = {
        all: () => [{ metadataProfileId: profile.id }],
      };

      const service = new MetadataProfileService(repo, { importListFactory });

      expect(() => service.delete(profile.id)).toThrow(MetadataProfileInUseException);
      expect(repo.delete).not.toHaveBeenCalled();
    });

    it("should_not_be_able_to_delete_profile_if_assigned_to_root_folder", () => {
      const profile = newMetadataProfile({ id: 2, name: "InUse" });
      const repo = makeRepo({ get: vi.fn(() => profile) });
      const rootFolderService: RootFolderProfileUsageLookup = {
        all: () => [{ defaultMetadataProfileId: profile.id }],
      };

      const service = new MetadataProfileService(repo, { rootFolderService });

      expect(() => service.delete(profile.id)).toThrow(MetadataProfileInUseException);
      expect(repo.delete).not.toHaveBeenCalled();
    });

    it("should_delete_profile_if_not_assigned_to_author_import_list_or_root_folder", () => {
      const profile = newMetadataProfile({ id: 1, name: "Free" });
      const repo = makeRepo({ get: vi.fn(() => profile) });
      const service = new MetadataProfileService(repo, {
        authorService: {
          findById: () => undefined,
          getAllAuthors: () => [{ metadataProfileId: 2 }],
        },
        importListFactory: { all: () => [{ metadataProfileId: 2 }] },
        rootFolderService: { all: () => [{ defaultMetadataProfileId: 2 }] },
      });

      service.delete(1);

      expect(repo.delete).toHaveBeenCalledWith(1);
    });
  });

  describe("filterBooks (rating/date/ignored-term filtering)", () => {
    function book(overrides: Partial<FilterBook> = {}): FilterBook {
      return {
        foreignBookId: "b1",
        title: "A Book",
        releaseDate: new Date("2020-01-01"),
        ratings: { votes: 10, value: 5 },
        editions: [
          {
            foreignEditionId: "e1",
            title: "A Book",
            language: "eng",
            isbn13: "1234567890123",
            asin: null,
            pageCount: 100,
            manualAdd: false,
          },
        ],
        ...overrides,
      };
    }

    function makeService(profile: MetadataProfile): MetadataProfileService {
      const repo = makeRepo({ get: vi.fn(() => profile) });
      return new MetadataProfileService(repo, { termMatcherService: new TermMatcherService() });
    }

    it("filters out books below MinPopularity with no local copy", () => {
      const profile = newMetadataProfile({ id: 1, minPopularity: 100 });
      const service = makeService(profile);

      const lowPop = book({ foreignBookId: "low", ratings: { votes: 1, value: 1 } });
      const highPop = book({ foreignBookId: "high", ratings: { votes: 100, value: 10 } });

      const result = service.filterBooks(
        { foreignAuthorId: "a1", series: [], books: [lowPop, highPop] },
        1
      );

      expect(result.map((b) => b.foreignBookId)).toEqual(["high"]);
    });

    it("keeps a below-popularity-threshold book if it releases in the future", () => {
      const profile = newMetadataProfile({ id: 1, minPopularity: 1000 });
      const service = makeService(profile);

      const future = book({
        foreignBookId: "future",
        ratings: { votes: 0, value: 0 },
        releaseDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 365),
      });

      const result = service.filterBooks({ foreignAuthorId: "a1", series: [], books: [future] }, 1);
      expect(result.map((b) => b.foreignBookId)).toEqual(["future"]);
    });

    it("the None profile's MinPopularity hack rejects every non-local book regardless of rating", () => {
      const profile = newMetadataProfile({ id: 1, minPopularity: 1e10 });
      const service = makeService(profile);

      const superPopular = book({ foreignBookId: "b1", ratings: { votes: 100000, value: 10 } });

      const result = service.filterBooks(
        { foreignAuthorId: "a1", series: [], books: [superPopular] },
        1
      );
      expect(result).toEqual([]);
    });

    it("SkipMissingDate filters out books with no release date", () => {
      const profile = newMetadataProfile({ id: 1, skipMissingDate: true, minPopularity: 0 });
      const service = makeService(profile);

      const noDate = book({ foreignBookId: "nodate", releaseDate: null });
      const withDate = book({ foreignBookId: "withdate" });

      const result = service.filterBooks(
        { foreignAuthorId: "a1", series: [], books: [noDate, withDate] },
        1
      );
      expect(result.map((b) => b.foreignBookId)).toEqual(["withdate"]);
    });

    it("Ignored terms filter out matching book titles", () => {
      const profile = newMetadataProfile({ id: 1, minPopularity: 0, ignored: ["Bad Title"] });
      const service = makeService(profile);

      const badTitle = book({ foreignBookId: "bad", title: "Some Bad Title Here" });
      const goodTitle = book({ foreignBookId: "good", title: "A Fine Title" });

      const result = service.filterBooks(
        { foreignAuthorId: "a1", series: [], books: [badTitle, goodTitle] },
        1
      );
      expect(result.map((b) => b.foreignBookId)).toEqual(["good"]);
    });

    it("keeps a book that would otherwise be filtered if it's already present locally (manual add)", () => {
      const profile = newMetadataProfile({ id: 1, minPopularity: 1000 });
      const repo = makeRepo({ get: vi.fn(() => profile) });
      const authorService: AuthorLookup = {
        findById: () => ({ id: 5, authorMetadataId: 55 }),
        getAllAuthors: () => [],
      };
      const bookService = {
        getBooksByAuthorMetadataId: () => [
          { foreignBookId: "keep-me", addType: BookAddType.Manual, editions: [] },
        ],
      };
      const service = new MetadataProfileService(repo, {
        authorService,
        bookService,
        termMatcherService: new TermMatcherService(),
      });

      const lowPop = book({ foreignBookId: "keep-me", ratings: { votes: 0, value: 0 } });

      const result = service.filterBooks({ foreignAuthorId: "a1", series: [], books: [lowPop] }, 1);
      expect(result.map((b) => b.foreignBookId)).toEqual(["keep-me"]);
    });

    it("MinPages filters out books whose every edition is under the threshold (unless PageCount is unknown/0)", () => {
      const profile = newMetadataProfile({ id: 1, minPopularity: 0, minPages: 200 });
      const service = makeService(profile);

      const tooShort = book({
        foreignBookId: "short",
        editions: [{ ...book().editions[0]!, pageCount: 50 }],
      });
      const longEnough = book({
        foreignBookId: "long",
        editions: [{ ...book().editions[0]!, pageCount: 300 }],
      });
      const unknownLength = book({
        foreignBookId: "unknown",
        editions: [{ ...book().editions[0]!, pageCount: 0 }],
      });

      const result = service.filterBooks(
        { foreignAuthorId: "a1", series: [], books: [tooShort, longEnough, unknownLength] },
        1
      );
      expect(result.map((b) => b.foreignBookId).sort()).toEqual(["long", "unknown"]);
    });

    it("filters editions by AllowedLanguages, dropping a book entirely if every edition is filtered out", () => {
      const profile = newMetadataProfile({ id: 1, minPopularity: 0, allowedLanguages: "eng" });
      const service = makeService(profile);

      const frenchOnly = book({
        foreignBookId: "fr",
        editions: [{ ...book().editions[0]!, language: "fre" }],
      });

      const result = service.filterBooks(
        { foreignAuthorId: "a1", series: [], books: [frenchOnly] },
        1
      );
      expect(result).toEqual([]);
    });

    it("SkipMissingIsbn filters editions with neither ISBN13 nor ASIN", () => {
      const profile = newMetadataProfile({ id: 1, minPopularity: 0, skipMissingIsbn: true });
      const service = makeService(profile);

      const noIsbn = book({
        foreignBookId: "noisbn",
        editions: [{ ...book().editions[0]!, isbn13: null, asin: null }],
      });

      const result = service.filterBooks({ foreignAuthorId: "a1", series: [], books: [noIsbn] }, 1);
      expect(result).toEqual([]);
    });
  });
});

import { describe, expect, it, afterEach, beforeEach } from "vitest";
import { createTestDatabase } from "./testDb.js";
import { AuthorRepository } from "../../books/authorRepository.js";
import { AuthorMetadataRepository } from "../../books/authorMetadataRepository.js";
import { UpdateCleanTitleForAuthor } from "../housekeepers/updateCleanTitleForAuthor.js";
import type { MainDatabase } from "../../db/db-factory.js";
import { NewItemMonitorTypes, newAuthorMetadata } from "../../books/models.js";

/** Ported from NzbDrone.Core/Housekeeping/Housekeepers/UpdateCleanTitleForAuthor.cs. */
describe("UpdateCleanTitleForAuthor", () => {
  let db: MainDatabase;
  let authorRepo: AuthorRepository;
  let metaRepo: AuthorMetadataRepository;

  beforeEach(() => {
    db = createTestDatabase();
    authorRepo = new AuthorRepository(db);
    metaRepo = new AuthorMetadataRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  function insertAuthor(name: string, staleCleanName: string) {
    const meta = metaRepo.insert({
      ...newAuthorMetadata(),
      foreignAuthorId: `fa-${name}`,
      titleSlug: `${name}-slug`,
      name,
      sortName: name.toLowerCase(),
      nameLastFirst: name,
      sortNameLastFirst: name.toLowerCase(),
    });

    return authorRepo.insert({
      id: 0,
      authorMetadataId: meta.id,
      cleanName: staleCleanName,
      monitored: true,
      monitorNewItems: NewItemMonitorTypes.All,
      lastInfoSync: null,
      path: `/books/${name}`,
      rootFolderPath: "",
      added: null,
      qualityProfileId: 1,
      metadataProfileId: 1,
      tags: [],
    });
  }

  it("recomputes CleanName from Name via cleanAuthorName and writes back stale rows", () => {
    const author = insertAuthor("J.R.R. Tolkien", "stale-clean-name");

    new UpdateCleanTitleForAuthor(authorRepo).clean();

    const updated = authorRepo.get(author.id);
    expect(updated.cleanName).not.toBe("stale-clean-name");
    expect(updated.cleanName).not.toBe("");
  });

  it("does not re-write rows whose CleanName is already up to date", () => {
    insertAuthor("Some Author", "placeholder");
    // Compute what UpdateCleanTitleForAuthor would compute, then pre-set it,
    // so the update() call would be a no-op if it ran -- verified by making
    // update() throw and confirming clean() doesn't call it. Uses
    // allWithMetadata() (not get()) since UpdateCleanTitleForAuthor reads
    // author.metadata.name, and plain get()/find() leave .metadata
    // unpopulated (see updateCleanTitleForAuthor.ts's doc comment).
    new UpdateCleanTitleForAuthor(authorRepo).clean();
    const alreadyClean = authorRepo.allWithMetadata()[0]!;

    let updateCalled = false;
    const spyRepo = {
      allWithMetadata: () => [alreadyClean],
      update: () => {
        updateCalled = true;
        throw new Error("should not be called");
      },
    };

    expect(() => new UpdateCleanTitleForAuthor(spyRepo).clean()).not.toThrow();
    expect(updateCalled).toBe(false);
  });
});

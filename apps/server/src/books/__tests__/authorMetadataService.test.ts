import { describe, expect, it, afterEach, beforeEach } from "vitest";
import { createTestDatabase } from "./testDb.js";
import { AuthorMetadataRepository } from "../authorMetadataRepository.js";
import { AuthorMetadataService } from "../authorMetadataService.js";
import type { MainDatabase } from "../../db/db-factory.js";
import { newAuthorMetadata, type AuthorMetadata } from "../models.js";

describe("AuthorMetadataService", () => {
  let db: MainDatabase;
  let repo: AuthorMetadataRepository;
  let service: AuthorMetadataService;

  beforeEach(() => {
    db = createTestDatabase();
    repo = new AuthorMetadataRepository(db);
    service = new AuthorMetadataService(repo);
  });

  afterEach(() => {
    db.close();
  });

  function meta(overrides: Partial<AuthorMetadata> = {}): AuthorMetadata {
    return { ...newAuthorMetadata(), foreignAuthorId: "fa-1", titleSlug: "s", name: "N", ...overrides } as AuthorMetadata;
  }

  it("upsert delegates to upsertMany([author])", () => {
    const changed = service.upsert(meta());
    expect(changed).toBe(true);
    expect(repo.count()).toBe(1);
  });

  it("upsertMany delegates straight through to the repository", () => {
    const changed = service.upsertMany([meta({ foreignAuthorId: "fa-1" }), meta({ foreignAuthorId: "fa-2", titleSlug: "s2" })]);
    expect(changed).toBe(true);
    expect(repo.count()).toBe(2);
  });
});

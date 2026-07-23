import { describe, expect, it } from "vitest";
import { createMainDatabase, type MainDatabase } from "../../db/db-factory.js";
import { MetadataFileRepository } from "../metadata/metadataFileRepository.js";
import { newMetadataFile } from "../metadata/metadataFile.js";
import { MetadataType } from "../metadata/metadataType.js";

/**
 * Exercises the shared `ExtraFileRepository<TExtraFile>` base
 * (deleteForAuthor/deleteForBook/deleteForBookFile/getFilesByAuthor/
 * getFilesByBook/getFilesByBookFile/findByPath) through its concrete
 * `MetadataFileRepository` subclass, against the real ported
 * `MetadataFiles` migration (0001_initial_setup.sql) -- proves the base
 * class's column list + generic query methods work against the real schema,
 * not just a hand-rolled table.
 */
function makeDatabase(): MainDatabase {
  return createMainDatabase(":memory:");
}

describe("ExtraFileRepository (via MetadataFileRepository)", () => {
  it("inserts and round-trips a metadata file", () => {
    const repo = new MetadataFileRepository(makeDatabase());

    const inserted = repo.insert(
      newMetadataFile({
        authorId: 1,
        relativePath: "author.opf",
        extension: ".opf",
        consumer: "TestConsumer",
        type: MetadataType.AuthorMetadata,
        hash: "abc123",
        added: "2026-01-01T00:00:00.000Z",
        lastUpdated: "2026-01-01T00:00:00.000Z",
      })
    );

    expect(inserted.id).toBeGreaterThan(0);

    const fetched = repo.get(inserted.id);
    expect(fetched.authorId).toBe(1);
    expect(fetched.relativePath).toBe("author.opf");
    expect(fetched.consumer).toBe("TestConsumer");
    expect(fetched.type).toBe(MetadataType.AuthorMetadata);
    expect(fetched.hash).toBe("abc123");
  });

  it("getFilesByAuthor returns only rows for the given author", () => {
    const repo = new MetadataFileRepository(makeDatabase());
    repo.insert(newMetadataFile({ authorId: 1, relativePath: "a.opf" }));
    repo.insert(newMetadataFile({ authorId: 2, relativePath: "b.opf" }));

    const result = repo.getFilesByAuthor(1);

    expect(result).toHaveLength(1);
    expect(result[0]!.relativePath).toBe("a.opf");
  });

  it("getFilesByBook filters by authorId AND bookId", () => {
    const repo = new MetadataFileRepository(makeDatabase());
    repo.insert(newMetadataFile({ authorId: 1, bookId: 10, relativePath: "a.opf" }));
    repo.insert(newMetadataFile({ authorId: 1, bookId: 20, relativePath: "b.opf" }));

    const result = repo.getFilesByBook(1, 10);

    expect(result).toHaveLength(1);
    expect(result[0]!.relativePath).toBe("a.opf");
  });

  it("getFilesByBookFile filters by bookFileId", () => {
    const repo = new MetadataFileRepository(makeDatabase());
    repo.insert(newMetadataFile({ authorId: 1, bookFileId: 5, relativePath: "a.opf" }));
    repo.insert(newMetadataFile({ authorId: 1, bookFileId: 6, relativePath: "b.opf" }));

    const result = repo.getFilesByBookFile(5);

    expect(result).toHaveLength(1);
    expect(result[0]!.relativePath).toBe("a.opf");
  });

  it("findByPath returns the single matching row for author + relative path", () => {
    const repo = new MetadataFileRepository(makeDatabase());
    repo.insert(newMetadataFile({ authorId: 1, relativePath: "a.opf" }));

    expect(repo.findByPath(1, "a.opf")?.relativePath).toBe("a.opf");
    expect(repo.findByPath(1, "missing.opf")).toBeUndefined();
    expect(repo.findByPath(2, "a.opf")).toBeUndefined();
  });

  it("deleteForAuthor removes every row for that author only", () => {
    const repo = new MetadataFileRepository(makeDatabase());
    repo.insert(newMetadataFile({ authorId: 1, relativePath: "a.opf" }));
    repo.insert(newMetadataFile({ authorId: 2, relativePath: "b.opf" }));

    repo.deleteForAuthor(1);

    expect(repo.getFilesByAuthor(1)).toHaveLength(0);
    expect(repo.getFilesByAuthor(2)).toHaveLength(1);
  });

  it("deleteForBook removes rows matching both authorId and bookId", () => {
    const repo = new MetadataFileRepository(makeDatabase());
    repo.insert(newMetadataFile({ authorId: 1, bookId: 10, relativePath: "a.opf" }));
    repo.insert(newMetadataFile({ authorId: 1, bookId: 20, relativePath: "b.opf" }));

    repo.deleteForBook(1, 10);

    expect(repo.getFilesByAuthor(1)).toHaveLength(1);
    expect(repo.getFilesByAuthor(1)[0]!.bookId).toBe(20);
  });

  it("deleteForBookFile removes rows for that book file only", () => {
    const repo = new MetadataFileRepository(makeDatabase());
    repo.insert(newMetadataFile({ authorId: 1, bookFileId: 5, relativePath: "a.opf" }));
    repo.insert(newMetadataFile({ authorId: 1, bookFileId: 6, relativePath: "b.opf" }));

    repo.deleteForBookFile(5);

    const remaining = repo.getFilesByAuthor(1);
    expect(remaining).toHaveLength(1);
    expect(remaining[0]!.bookFileId).toBe(6);
  });
});

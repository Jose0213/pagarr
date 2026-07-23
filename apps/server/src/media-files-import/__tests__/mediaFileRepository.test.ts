import { describe, expect, it, afterEach, beforeEach } from "vitest";
import { createTestDatabase } from "../../books/__tests__/testDb.js";
import { AuthorRepository } from "../../books/authorRepository.js";
import { AuthorMetadataRepository } from "../../books/authorMetadataRepository.js";
import { BookRepository } from "../../books/bookRepository.js";
import { EditionRepository } from "../../books/editionRepository.js";
import { newAuthor, newAuthorMetadata, newBook, newEdition } from "../../books/models.js";
import type { MainDatabase } from "../../db/db-factory.js";
import { MediaFileRepository } from "../mediaFileRepository.js";
import { newBookFile } from "../bookFile.js";
import { newQualityModel } from "../../qualities/qualityModel.js";
import { Quality } from "../../qualities/quality.js";

describe("MediaFileRepository", () => {
  let db: MainDatabase;
  let mediaFileRepo: MediaFileRepository;
  let authorRepo: AuthorRepository;
  let metaRepo: AuthorMetadataRepository;
  let bookRepo: BookRepository;
  let editionRepo: EditionRepository;

  beforeEach(() => {
    db = createTestDatabase();
    mediaFileRepo = new MediaFileRepository(db);
    authorRepo = new AuthorRepository(db);
    metaRepo = new AuthorMetadataRepository(db);
    bookRepo = new BookRepository(db);
    editionRepo = new EditionRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  function seedGraph() {
    const meta = metaRepo.insert({
      ...newAuthorMetadata(),
      foreignAuthorId: "fa-1",
      titleSlug: "slug-1",
      name: "Test Author",
    });
    const author = authorRepo.insert({
      ...newAuthor(),
      authorMetadataId: meta.id,
      cleanName: "testauthor",
      path: "/books/author",
      monitored: true,
    });
    const book = bookRepo.insert({
      ...newBook(),
      authorMetadataId: meta.id,
      foreignBookId: "fb-1",
      titleSlug: "book-1",
      title: "A Book",
      cleanTitle: "abook",
      monitored: true,
    });
    const edition = editionRepo.insert({
      ...newEdition(),
      bookId: book.id,
      foreignEditionId: "fe-1",
      titleSlug: "edition-1",
      title: "A Book Edition",
      monitored: true,
    });

    return { author, book, edition };
  }

  function insertBookFile(
    editionId: number,
    overrides: Partial<ReturnType<typeof newBookFile>> = {}
  ) {
    return mediaFileRepo.insert({
      ...newBookFile(),
      editionId,
      quality: newQualityModel(Quality.FLAC),
      size: 1000,
      dateAdded: new Date().toISOString(),
      modified: new Date().toISOString(),
      path: overrides.path ?? `/books/author/book-${Math.random()}.flac`,
      ...overrides,
    });
  }

  it("insert + get round-trips a BookFile including its Quality JSON column", () => {
    const { edition } = seedGraph();
    const inserted = insertBookFile(edition.id, { path: "/books/author/track.flac" });

    const fetched = mediaFileRepo.get(inserted.id);

    expect(fetched.path).toBe("/books/author/track.flac");
    expect(fetched.quality.quality.id).toBe(Quality.FLAC.id);
    expect(fetched.editionId).toBe(edition.id);
  });

  it("getFilesByEdition returns only files for the given edition", () => {
    const { edition } = seedGraph();
    insertBookFile(edition.id, { path: "/books/author/a.flac" });
    insertBookFile(edition.id, { path: "/books/author/b.flac" });

    const files = mediaFileRepo.getFilesByEdition(edition.id);
    expect(files).toHaveLength(2);
  });

  it("getFilesByBook joins through Editions to filter by BookId", () => {
    const { book, edition } = seedGraph();
    insertBookFile(edition.id, { path: "/books/author/a.flac" });

    const files = mediaFileRepo.getFilesByBook(book.id);
    expect(files).toHaveLength(1);
    expect(files[0]!.edition?.book?.id).toBe(book.id);
  });

  it("getFilesByAuthor joins all the way through to Authors.Id and populates .author/.edition", () => {
    const { author, edition } = seedGraph();
    insertBookFile(edition.id, { path: "/books/author/a.flac" });

    const files = mediaFileRepo.getFilesByAuthor(author.id);
    expect(files).toHaveLength(1);
    expect(files[0]!.author?.id).toBe(author.id);
    expect(files[0]!.author?.metadata?.name).toBe("Test Author");
    expect(files[0]!.edition?.id).toBe(edition.id);
  });

  it("getUnmappedFiles returns files with EditionId = 0, unjoined", () => {
    const orphan = mediaFileRepo.insert({
      ...newBookFile(),
      editionId: 0,
      quality: newQualityModel(Quality.MP3),
      size: 500,
      dateAdded: new Date().toISOString(),
      modified: new Date().toISOString(),
      path: "/books/orphan.mp3",
    });
    const { edition } = seedGraph();
    insertBookFile(edition.id);

    const unmapped = mediaFileRepo.getUnmappedFiles();
    expect(unmapped).toHaveLength(1);
    expect(unmapped[0]!.id).toBe(orphan.id);
  });

  it("getFileWithPath finds a single file by exact path", () => {
    const { edition } = seedGraph();
    insertBookFile(edition.id, { path: "/books/author/unique.flac" });

    const found = mediaFileRepo.getFileWithPath("/books/author/unique.flac");
    expect(found).toBeDefined();
    expect(found!.path).toBe("/books/author/unique.flac");

    expect(mediaFileRepo.getFileWithPath("/does/not/exist.flac")).toBeUndefined();
  });

  it("getFilesWithBasePath matches files under a directory prefix, not partial segment matches", () => {
    const { edition } = seedGraph();
    insertBookFile(edition.id, { path: "/books/author/sub/track1.flac" });
    insertBookFile(edition.id, { path: "/books/authorxyz/track2.flac" });

    const files = mediaFileRepo.getFilesWithBasePath("/books/author");
    expect(files.map((f) => f.path)).toEqual(["/books/author/sub/track1.flac"]);
  });

  it("deleteFilesByBook removes every file for the book", () => {
    const { book, edition } = seedGraph();
    insertBookFile(edition.id, { path: "/books/author/a.flac" });
    insertBookFile(edition.id, { path: "/books/author/b.flac" });

    mediaFileRepo.deleteFilesByBook(book.id);

    expect(mediaFileRepo.getFilesByBook(book.id)).toHaveLength(0);
    expect(mediaFileRepo.all()).toHaveLength(0);
  });

  it("unlinkFilesByBook sets EditionId to 0 rather than deleting", () => {
    const { book, edition } = seedGraph();
    const file = insertBookFile(edition.id, { path: "/books/author/a.flac" });

    mediaFileRepo.unlinkFilesByBook(book.id);

    const updated = mediaFileRepo.get(file.id);
    expect(updated.editionId).toBe(0);
  });

  it("getFileWithPathList matches multiple paths via a limited (Editions-only) join", () => {
    const { edition } = seedGraph();
    insertBookFile(edition.id, { path: "/books/author/a.flac" });
    insertBookFile(edition.id, { path: "/books/author/b.flac" });
    insertBookFile(edition.id, { path: "/books/author/c.flac" });

    const files = mediaFileRepo.getFileWithPathList([
      "/books/author/a.flac",
      "/books/author/c.flac",
      "/does/not/exist.flac",
    ]);

    expect(files.map((f) => f.path).sort()).toEqual([
      "/books/author/a.flac",
      "/books/author/c.flac",
    ]);
  });
});

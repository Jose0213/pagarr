import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ExtendedDiskProvider } from "../diskProvider.js";
import { BookFileMovingService } from "../bookFileMovingService.js";
import { RootFolderNotFoundException, SameFilenameException } from "../errors.js";
import { MediaFileAttributeService } from "../mediaFileAttributeService.js";
import type { IUpdateBookFileService } from "../updateBookFileService.js";
import type { BookFile, EditionServiceLike } from "../types.js";
import type { Author, Edition } from "../../books/models.js";

/**
 * New tests covering the ported slice of BookFileMovingServiceFixture's
 * intent this port's `moveBookFile` supports: builds a destination path
 * from the naming engine, creates missing author/book/track folders, moves
 * the file, and raises the same-filename/root-folder-missing errors the C#
 * source raises. Directly exercises known-issue #5 territory (folder
 * creation under a missing root).
 */
function makeConfigService() {
  return {
    setPermissionsLinux: false,
    chmodFolder: "755",
    chownGroup: "",
  } as never;
}

describe("BookFileMovingService", () => {
  let tmpDir: string;
  let libraryRoot: string;
  let diskProvider: ExtendedDiskProvider;
  let mediaFileAttributeService: MediaFileAttributeService;
  let updateBookFileService: IUpdateBookFileService;
  let editionService: EditionServiceLike;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "pagarr-move-test-"));
    libraryRoot = join(tmpDir, "library");
    diskProvider = new ExtendedDiskProvider();
    diskProvider.createFolder(libraryRoot);

    mediaFileAttributeService = new MediaFileAttributeService(makeConfigService(), diskProvider);
    updateBookFileService = { changeFileDateForFile: vi.fn() };
    editionService = { getEdition: vi.fn() };
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  function makeFileNameBuilderStub(newFileName: string) {
    return {
      buildBookFileName: vi.fn(() => newFileName),
      buildBookFilePath: vi.fn(
        (author: Author, _edition: Edition, fileName: string, extension: string) =>
          `${author.path}/${fileName}${extension}`
      ),
      buildBookPath: vi.fn((author: Author) => author.path),
    } as unknown as import("../organizer/fileNameBuilder.js").FileNameBuilder;
  }

  function makeAuthor(path: string): Author {
    return { id: 1, path } as Author;
  }

  function makeBookFile(path: string): BookFile {
    return {
      id: 1,
      path,
      size: 5,
      modified: new Date().toISOString(),
      dateAdded: new Date().toISOString(),
      originalFilePath: null,
      sceneName: null,
      releaseGroup: null,
      quality: { quality: { id: 10 } },
      indexerFlags: 0,
      mediaInfo: null,
      editionId: 1,
      calibreId: 0,
      part: 1,
      partCount: 1,
      edition: { id: 1, book: { id: 1, releaseDate: null } } as unknown as BookFile["edition"],
    };
  }

  it("moves a book file into a newly created author folder", () => {
    const authorPath = join(libraryRoot, "Author Name");
    const sourcePath = join(tmpDir, "incoming", "book.mp3");
    (editionService.getEdition as ReturnType<typeof vi.fn>).mockReturnValue({
      id: 1,
      book: { id: 1 },
    });
    diskProvider.createFolder(join(tmpDir, "incoming"));
    writeFileSync(sourcePath, "audio-bytes");

    const service = new BookFileMovingService(
      editionService,
      updateBookFileService,
      makeFileNameBuilderStub("Author Name - Book Title"),
      diskProvider,
      mediaFileAttributeService,
      { copyUsingHardlinks: false }
    );

    const author = makeAuthor(authorPath);
    const bookFile = makeBookFile(sourcePath);

    const moved = service.moveBookFile(bookFile, author);

    expect(existsSync(sourcePath)).toBe(false);
    expect(moved.path).toBe(`${authorPath}/Author Name - Book Title.mp3`);
    expect(existsSync(moved.path)).toBe(true);
    expect(updateBookFileService.changeFileDateForFile).toHaveBeenCalled();
  });

  it("throws RootFolderNotFoundException when the root folder is missing", () => {
    const missingRoot = join(tmpDir, "does-not-exist");
    const authorPath = join(missingRoot, "Author Name");
    const sourcePath = join(tmpDir, "incoming.mp3");
    writeFileSync(sourcePath, "x");
    (editionService.getEdition as ReturnType<typeof vi.fn>).mockReturnValue({
      id: 1,
      book: { id: 1 },
    });

    const service = new BookFileMovingService(
      editionService,
      updateBookFileService,
      makeFileNameBuilderStub("Author Name - Book Title"),
      diskProvider,
      mediaFileAttributeService,
      { copyUsingHardlinks: false }
    );

    expect(() => service.moveBookFile(makeBookFile(sourcePath), makeAuthor(authorPath))).toThrow(
      RootFolderNotFoundException
    );
  });

  it("throws SameFilenameException when source and computed destination are identical", () => {
    // buildBookFilePath in the stub joins with "/" (matching the real
    // FileNameBuilder -- see fileNameBuilder.ts's joinPath helper), so the
    // source path here is constructed the same way rather than via
    // node:path's `join` (which emits "\" on Windows) to ensure the two
    // computed strings are the exact same path, not just the same file.
    const authorPath = join(libraryRoot, "Author Name");
    diskProvider.createFolder(authorPath);
    const sourcePath = `${authorPath}/Already Named.mp3`;
    writeFileSync(sourcePath, "x");
    (editionService.getEdition as ReturnType<typeof vi.fn>).mockReturnValue({
      id: 1,
      book: { id: 1 },
    });

    const service = new BookFileMovingService(
      editionService,
      updateBookFileService,
      makeFileNameBuilderStub("Already Named"),
      diskProvider,
      mediaFileAttributeService,
      { copyUsingHardlinks: false }
    );

    expect(() => service.moveBookFile(makeBookFile(sourcePath), makeAuthor(authorPath))).toThrow(
      SameFilenameException
    );
  });

  it("fires onTrackFolderCreated only when a folder actually had to be created", () => {
    const authorPath = join(libraryRoot, "Author Name");
    const sourcePath = join(tmpDir, "incoming2.mp3");
    writeFileSync(sourcePath, "x");
    (editionService.getEdition as ReturnType<typeof vi.fn>).mockReturnValue({
      id: 1,
      book: { id: 1 },
    });

    const onTrackFolderCreated = vi.fn();
    const service = new BookFileMovingService(
      editionService,
      updateBookFileService,
      makeFileNameBuilderStub("New Book"),
      diskProvider,
      mediaFileAttributeService,
      { copyUsingHardlinks: false, onTrackFolderCreated }
    );

    service.moveBookFile(makeBookFile(sourcePath), makeAuthor(authorPath));

    expect(onTrackFolderCreated).toHaveBeenCalledTimes(1);
    expect(onTrackFolderCreated.mock.calls[0]![0]).toMatchObject({ authorFolder: authorPath });
  });
});

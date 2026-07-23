import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DeleteBadMediaCovers,
  type AuthorPathsLookup,
  type MetadataFileLookup,
  type MetadataImageFile,
} from "../housekeepers/deleteBadMediaCovers.js";
import { HousekeepingDiskProvider } from "../diskProvider.js";
import type { IConfigService } from "../../config/configService.js";

/** Ported from NzbDrone.Core/Housekeeping/Housekeepers/DeleteBadMediaCovers.cs. */
describe("DeleteBadMediaCovers", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "pagarr-housekeeping-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  function makeConfigService(cleanupMetadataImages: boolean): IConfigService {
    let flag = cleanupMetadataImages;
    return {
      get cleanupMetadataImages() {
        return flag;
      },
      set cleanupMetadataImages(v: boolean) {
        flag = v;
      },
    } as unknown as IConfigService;
  }

  it("does nothing when configService.cleanupMetadataImages is false", () => {
    const configService = makeConfigService(false);
    const authorService: AuthorPathsLookup = { allAuthorPaths: () => new Map([[1, tempDir]]) };
    const metaFileService: MetadataFileLookup = {
      getFilesByAuthor: () => {
        throw new Error("should not be called");
      },
      delete: () => {
        throw new Error("should not be called");
      },
    };

    new DeleteBadMediaCovers(
      metaFileService,
      authorService,
      new HousekeepingDiskProvider(),
      configService
    ).clean();

    expect(configService.cleanupMetadataImages).toBe(false);
  });

  it("deletes an image file whose header bytes contain 'html' (HTML error page saved with an image extension)", () => {
    const badPath = join(tempDir, "cover.jpg");
    writeFileSync(badPath, "<html><body>403 Forbidden</body></html>");

    const configService = makeConfigService(true);
    const authorService: AuthorPathsLookup = { allAuthorPaths: () => new Map([[1, tempDir]]) };
    const image: MetadataImageFile = {
      id: 42,
      relativePath: "cover.jpg",
      lastUpdated: new Date().toISOString(),
    };
    const deletedIds: number[] = [];
    const metaFileService: MetadataFileLookup = {
      getFilesByAuthor: () => [image],
      delete: (id) => deletedIds.push(id),
    };

    new DeleteBadMediaCovers(
      metaFileService,
      authorService,
      new HousekeepingDiskProvider(),
      configService
    ).clean();

    expect(deletedIds).toEqual([42]);
    expect(existsSync(badPath)).toBe(false);
  });

  it("keeps a real (non-HTML) image file", () => {
    const goodPath = join(tempDir, "cover.jpg");
    // JPEG magic bytes: FF D8 FF ...
    writeFileSync(
      goodPath,
      Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46])
    );

    const configService = makeConfigService(true);
    const authorService: AuthorPathsLookup = { allAuthorPaths: () => new Map([[1, tempDir]]) };
    const image: MetadataImageFile = {
      id: 1,
      relativePath: "cover.jpg",
      lastUpdated: new Date().toISOString(),
    };
    const deletedIds: number[] = [];
    const metaFileService: MetadataFileLookup = {
      getFilesByAuthor: () => [image],
      delete: (id) => deletedIds.push(id),
    };

    new DeleteBadMediaCovers(
      metaFileService,
      authorService,
      new HousekeepingDiskProvider(),
      configService
    ).clean();

    expect(deletedIds).toEqual([]);
    expect(existsSync(goodPath)).toBe(true);
  });

  it("ignores images last updated on/before the 2014-12-27 cutoff, even if they'd fail the HTML sniff", () => {
    const oldBadPath = join(tempDir, "old-cover.jpg");
    writeFileSync(oldBadPath, "<html>old bad file</html>");

    const configService = makeConfigService(true);
    const authorService: AuthorPathsLookup = { allAuthorPaths: () => new Map([[1, tempDir]]) };
    const image: MetadataImageFile = {
      id: 7,
      relativePath: "old-cover.jpg",
      lastUpdated: new Date(Date.UTC(2014, 11, 27)).toISOString(),
    };
    const deletedIds: number[] = [];
    const metaFileService: MetadataFileLookup = {
      getFilesByAuthor: () => [image],
      delete: (id) => deletedIds.push(id),
    };

    new DeleteBadMediaCovers(
      metaFileService,
      authorService,
      new HousekeepingDiskProvider(),
      configService
    ).clean();

    expect(deletedIds).toEqual([]);
  });

  it("ignores non-image extensions even if newer than the cutoff", () => {
    const authorService: AuthorPathsLookup = { allAuthorPaths: () => new Map([[1, tempDir]]) };
    const image: MetadataImageFile = {
      id: 1,
      relativePath: "metadata.xml",
      lastUpdated: new Date().toISOString(),
    };
    const deletedIds: number[] = [];
    const metaFileService: MetadataFileLookup = {
      getFilesByAuthor: () => [image],
      delete: (id) => deletedIds.push(id),
    };

    new DeleteBadMediaCovers(
      metaFileService,
      authorService,
      new HousekeepingDiskProvider(),
      makeConfigService(true)
    ).clean();

    expect(deletedIds).toEqual([]);
  });

  it("resets configService.cleanupMetadataImages to false unconditionally after running, even when nothing was deleted", () => {
    const configService = makeConfigService(true);
    const authorService: AuthorPathsLookup = { allAuthorPaths: () => new Map() };
    const metaFileService: MetadataFileLookup = {
      getFilesByAuthor: () => [],
      delete: () => {},
    };

    new DeleteBadMediaCovers(
      metaFileService,
      authorService,
      new HousekeepingDiskProvider(),
      configService
    ).clean();

    expect(configService.cleanupMetadataImages).toBe(false);
  });

  it("swallows a per-image error via onError and continues to the next image", () => {
    const configService = makeConfigService(true);
    const authorService: AuthorPathsLookup = { allAuthorPaths: () => new Map([[1, tempDir]]) };
    const missingImage: MetadataImageFile = {
      id: 1,
      relativePath: "does-not-exist.jpg",
      lastUpdated: new Date().toISOString(),
    };
    const goodPath = join(tempDir, "cover.jpg");
    writeFileSync(goodPath, Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0]));
    const goodImage: MetadataImageFile = {
      id: 2,
      relativePath: "cover.jpg",
      lastUpdated: new Date().toISOString(),
    };

    const deletedIds: number[] = [];
    const metaFileService: MetadataFileLookup = {
      getFilesByAuthor: () => [missingImage, goodImage],
      delete: (id) => deletedIds.push(id),
    };
    const errors: unknown[] = [];

    new DeleteBadMediaCovers(
      metaFileService,
      authorService,
      new HousekeepingDiskProvider(),
      configService,
      (_path, error) => errors.push(error)
    ).clean();

    expect(errors).toHaveLength(1);
    expect(deletedIds).toEqual([]);
  });
});

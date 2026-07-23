import { join } from "node:path";
import type { IConfigService } from "../../config/configService.js";
import type { IHousekeepingDiskProvider } from "../diskProvider.js";
import type { IHousekeepingTask } from "../iHousekeepingTask.js";

/** Minimal read surface this task needs from AuthorService -- see books/authorService.ts's real `allAuthorPaths()`. */
export interface AuthorPathsLookup {
  allAuthorPaths(): Map<number, string>;
}

/** A metadata (cover image) file row, as this task reads/deletes it -- matches `extras/metadata/metadataFile.ts`'s `MetadataFile` shape. */
export interface MetadataImageFile {
  id: number;
  relativePath: string;
  lastUpdated: string;
}

/** Minimal read/write surface this task needs from MetadataFileService -- see extras/metadata/metadataFileService.ts's real `getFilesByAuthor`/`delete`. */
export interface MetadataFileLookup {
  getFilesByAuthor(authorId: number): MetadataImageFile[];
  delete(id: number): void;
}

const IMAGE_EXTENSIONS = [".jpg", ".png", ".gif"];

/**
 * Ported from `DeleteBadMediaCovers.IsValid`'s cutoff date: images last
 * updated on/before 2014-12-27 predate the bug this task cleans up after,
 * so they're left alone even if they'd otherwise fail the HTML-sniff check
 * below (ported verbatim, including the fixed historical date literal).
 */
const VALID_BEFORE_CUTOFF = new Date(Date.UTC(2014, 11, 27));

/**
 * Ported from NzbDrone.Core/Housekeeping/Housekeepers/DeleteBadMediaCovers.cs.
 *
 * Some cover-image downloads historically saved an HTML error page (e.g. a
 * "403 Forbidden" response body) to disk with an image extension instead of
 * failing loudly. This task re-validates every author's metadata image
 * files newer than the cutoff date, sniffing the first 10 bytes for the
 * literal text "html" (case-insensitive) -- a real image file's header
 * bytes (JPEG/PNG/GIF magic numbers) never contain that ASCII sequence, so
 * this is a cheap, if crude, "is this actually binary image data" check.
 * Invalid files are deleted from both the MetadataFiles table and disk.
 *
 * Gated behind `configService.cleanupMetadataImages` (a one-shot flag: read
 * once, then unconditionally set back to `false` at the end of `Clean()` --
 * ported faithfully, including running the *entire* per-author scan even
 * when nothing turns out to need cleaning, and unconditionally clearing the
 * flag even if the loop found and fixed nothing).
 */
export class DeleteBadMediaCovers implements IHousekeepingTask {
  constructor(
    private readonly metaFileService: MetadataFileLookup,
    private readonly authorService: AuthorPathsLookup,
    private readonly diskProvider: IHousekeepingDiskProvider,
    private readonly configService: IConfigService,
    private readonly onError?: (path: string, error: unknown) => void
  ) {}

  clean(): void {
    if (!this.configService.cleanupMetadataImages) {
      return;
    }

    const authorPaths = this.authorService.allAuthorPaths();

    for (const [authorId, authorPath] of authorPaths) {
      const images = this.metaFileService
        .getFilesByAuthor(authorId)
        .filter(
          (c) =>
            new Date(c.lastUpdated).getTime() > VALID_BEFORE_CUTOFF.getTime() &&
            IMAGE_EXTENSIONS.some((ext) => c.relativePath.toLowerCase().endsWith(ext))
        );

      for (const image of images) {
        try {
          const path = join(authorPath, image.relativePath);
          if (!this.isValid(path)) {
            this.deleteMetadata(image.id, path);
          }
        } catch (e) {
          this.onError?.(image.relativePath, e);
        }
      }
    }

    this.configService.cleanupMetadataImages = false;
  }

  private deleteMetadata(id: number, path: string): void {
    this.metaFileService.delete(id);
    this.diskProvider.deleteFile(path);
  }

  /**
   * Ported from `DeleteBadMediaCovers.IsValid`: reads the first 10 bytes of
   * the file and rejects it if that header decodes (via the platform
   * default/Latin-1-like single-byte encoding, matching C#'s
   * `Encoding.Default` on .NET Core -- always UTF-8-compatible for ASCII
   * range, which is all this check ever looks for) to text containing
   * "html", case-insensitively. A file shorter than 10 bytes is also
   * rejected outright (can't be a valid image).
   */
  private isValid(path: string): boolean {
    const buffer = this.diskProvider.readHeaderBytes(path, 10);

    if (buffer.length < 10) {
      return false;
    }

    const text = buffer.toString("latin1");
    return !text.toLowerCase().includes("html");
  }
}

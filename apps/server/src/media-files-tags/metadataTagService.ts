import { extname } from "node:path";
import { AudioTagService } from "./audioTagService.js";
import { EbookTagService } from "./ebookTagService.js";
import { MediaFileExtensions } from "../parser/qualityParser.js";
import type { ParsedTrackInfo } from "../parser/model/parsedTrackInfo.js";
import type { RetagBookFilePreview } from "./retagBookFilePreview.js";
import type { BookFileRef, EditionRef } from "./audioTagTypes.js";
import type { RetagAuthorCommand, RetagFilesCommand } from "./ebookTagTypes.js";

/**
 * Ported from NzbDrone.Core/MediaFiles/MetadataTagService.cs.
 *
 * `IExecute<RetagFilesCommand>`/`IExecute<RetagAuthorCommand>` (the
 * Messaging module's command-handler interface, Phase 4, un-ported) are
 * not implemented as a separate interface here -- `execute*` are ported as
 * plain methods with the same bodies as the C# `Execute(...)`
 * implementations; a future command-bus port can wire these in directly.
 */
export class MetadataTagService {
  constructor(
    private readonly audioTagService: AudioTagService,
    private readonly ebookTagService: EbookTagService
  ) {}

  /** Ported from `MetadataTagService.ReadTags(IFileInfo file)`. */
  readTags(filePath: string): ParsedTrackInfo | null {
    if (MediaFileExtensions.AudioExtensions.has(extname(filePath))) {
      return this.audioTagService.readTags(filePath);
    } else {
      return this.ebookTagService.readTags(filePath);
    }
  }

  /** Ported from `MetadataTagService.WriteTags(BookFile bookFile, bool newDownload, bool force = false)`. */
  writeTags(bookFile: BookFileRef, newDownload: boolean, force = false): void {
    const extension = extname(bookFile.path);
    if (MediaFileExtensions.AudioExtensions.has(extension)) {
      this.audioTagService.writeTags(bookFile, newDownload, force);
    } else if (bookFile.calibreId > 0) {
      this.ebookTagService.writeTags(bookFile, newDownload, force);
    }
  }

  /** Ported from `MetadataTagService.SyncTags(List<Edition> editions)`. */
  syncTags(editions: EditionRef[]): void {
    this.audioTagService.syncTags(editions);
    this.ebookTagService.syncTags(editions);
  }

  /** Ported from `MetadataTagService.GetRetagPreviewsByAuthor(int authorId)`. */
  getRetagPreviewsByAuthor(authorId: number): RetagBookFilePreview[] {
    const previews = this.audioTagService.getRetagPreviewsByAuthor(authorId);
    previews.push(...this.ebookTagService.getRetagPreviewsByAuthor(authorId));
    return previews;
  }

  /** Ported from `MetadataTagService.GetRetagPreviewsByBook(int bookId)`. */
  getRetagPreviewsByBook(bookId: number): RetagBookFilePreview[] {
    const previews = this.audioTagService.getRetagPreviewsByBook(bookId);
    previews.push(...this.ebookTagService.getRetagPreviewsByBook(bookId));
    return previews;
  }

  /** Ported from `MetadataTagService.Execute(RetagFilesCommand message)`. */
  executeRetagFiles(message: RetagFilesCommand): void {
    this.ebookTagService.retagFiles(message);
    this.audioTagService.retagFiles(message);
  }

  /** Ported from `MetadataTagService.Execute(RetagAuthorCommand message)`. */
  executeRetagAuthor(message: RetagAuthorCommand): void {
    this.ebookTagService.retagAuthor(message);
    this.audioTagService.retagAuthor(message);
  }
}

import type { LocalBook } from "../../../parser/model/localBook.js";
import type { LocalEdition } from "../../../parser/model/localEdition.js";
import { MediaFileExtensions } from "../../../parser/qualityParser.js";
import { getSceneName } from "../sceneNameCalculator.js";
import { AugmentingFailedException } from "./aggregationFailedException.js";
import type { IAggregate } from "./aggregators/aggregateLocalTrack.js";

/**
 * Forward-reference for the slice of `NzbDrone.Common.Disk.IDiskProvider`
 * this service calls (`GetFileSize`) -- see mediaFileDiskProvider.ts for
 * the shared, module-wide disk-provider forward-reference this and other
 * files in this module use.
 */
export interface AggregationDiskProviderLike {
  getFileSize(path: string): number;
}

/**
 * Ported from NzbDrone.Core/MediaFiles/BookImport/Aggregation/AggregationService.cs.
 * C# class/interface name is `AugmentingService`/`IAugmentingService`
 * (the containing directory is `Aggregation/`, the class is `Augmenting*`
 * -- a real naming mismatch in the upstream source, preserved here by
 * naming the exported class to match the actual C# class name rather than
 * the directory/file name, same convention as importAuthorDefaults.ts and
 * aggregationFailedException.ts).
 */
export interface IAugmentingService {
  augment(localTrack: LocalBook, otherFiles: boolean): LocalBook;
  augmentEdition(localBook: LocalEdition): LocalEdition;
}

export class AugmentingService implements IAugmentingService {
  constructor(
    private readonly trackAugmenters: readonly IAggregate<LocalBook>[],
    private readonly bookAugmenters: readonly IAggregate<LocalEdition>[],
    private readonly diskProvider: AggregationDiskProviderLike,
    /** Stand-in for NLog `_logger.Warn(ex, ex.Message)` -- see monitorNewBookService.ts's doc comment for why this codebase omits NLog. Defaults to a no-op. */
    private readonly onAugmenterError: (error: unknown, message: string) => void = () => {}
  ) {}

  augment(localTrack: LocalBook, otherFiles: boolean): LocalBook {
    if (
      localTrack.downloadClientBookInfo === null &&
      localTrack.folderTrackInfo === null &&
      localTrack.fileTrackInfo === null
    ) {
      if (MediaFileExtensions.AllExtensions.has(getExtension(localTrack.path))) {
        throw new AugmentingFailedException(
          `Unable to parse book info from path: ${localTrack.path}`
        );
      }
    }

    localTrack.size = this.diskProvider.getFileSize(localTrack.path);
    localTrack.sceneName = localTrack.sceneSource ? getSceneName(localTrack) : null;

    for (const augmenter of this.trackAugmenters) {
      try {
        augmenter.aggregate(localTrack, otherFiles);
      } catch (ex) {
        const message = `Unable to augment information for file: '${localTrack.path}'. Author: ${authorLabel(localTrack.author)} Error: ${errorMessage(ex)}`;
        this.onAugmenterError(ex, message);
      }
    }

    return localTrack;
  }

  augmentEdition(localBook: LocalEdition): LocalEdition {
    for (const augmenter of this.bookAugmenters) {
      try {
        augmenter.aggregate(localBook, false);
      } catch (ex) {
        this.onAugmenterError(ex, errorMessage(ex));
      }
    }

    return localBook;
  }
}

function errorMessage(ex: unknown): string {
  return ex instanceof Error ? ex.message : String(ex);
}

/** Ported from C#'s implicit `ToString()` interpolation of `LocalBook.Author` (an `Author`, which C# renders via `object.ToString()` -- default "NzbDrone.Core.Books.Author" unless overridden, which it isn't). Ported as the author's name (falling back to empty) since that's a strictly more useful diagnostic than the C# default's type-name noise, while staying a plain string for lint's no-base-to-string rule. */
function authorLabel(author: LocalBook["author"]): string {
  return author?.metadata?.name ?? "";
}

/**
 * Ported from `System.IO.Path.GetExtension`. C#'s
 * `MediaFileExtensions.AllExtensions` is a `HashSet<string>(...,
 * StringComparer.OrdinalIgnoreCase)`, so `.Contains(extension)` there is
 * case-insensitive; this port's `MediaFileExtensions.AllExtensions` (in
 * parser/qualityParser.ts) is a plain `Set` with lowercase keys, so the
 * extension is lowercased here at the call site to match that same
 * case-insensitive behavior.
 */
function getExtension(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const base = normalized.substring(normalized.lastIndexOf("/") + 1);
  const dotIndex = base.lastIndexOf(".");
  return dotIndex === -1 ? "" : base.substring(dotIndex).toLowerCase();
}

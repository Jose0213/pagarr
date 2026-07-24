import type { QueueItem } from "../../../queue/queue.js";
import type { QualityModel } from "../../../qualities/qualityModel.js";
import type { CustomFormat } from "../../../profiles/customFormat.js";
import { calculateCustomFormatScore } from "../../../profiles/qualities/qualityProfile.js";
import type { QualityProfile } from "../../../profiles/qualities/qualityProfile.js";
import type {
  TrackedDownloadState,
  TrackedDownloadStatus,
} from "../../../download-tracking/tracked-downloads/trackedDownload.js";
import type { TrackedDownloadStatusMessage } from "../../../download-tracking/tracked-downloads/trackedDownloadStatusMessage.js";
import type { DownloadProtocol } from "../../../indexers/DownloadProtocol.js";
import type { RestResource } from "../../rest/RestResource.js";
import { authorToResource, type AuthorResource } from "../author/AuthorResource.js";
import { bookToResource, type BookResource } from "../books/BookResource.js";
import { toCustomFormatResource } from "../shared/embeddedResources.js";

/**
 * Ported from Readarr.Api.V1/Queue/QueueResource.cs.
 *
 * `Author`/`Book` embed the real `AuthorResource`/`BookResource` (see
 * `resources/author/AuthorResource.ts` / `resources/books/BookResource.ts`)
 * -- repointed during merge reconciliation from this worktree's original
 * narrow forward-ref stand-ins (`resources/shared/embeddedResources.ts`'s
 * `EmbeddedAuthorResource`/`EmbeddedBookResource`) once the sibling Phase 5
 * groups that own those resources landed. `CustomFormats` still uses
 * `embeddedResources.ts`'s `toCustomFormatResource` -- that stand-in is
 * repointed separately once `api-download-notifications` (the group that
 * owns the real `CustomFormatResource`) merges.
 */
export interface QueueResource extends RestResource {
  authorId?: number;
  bookId?: number;
  author?: AuthorResource | null;
  book?: BookResource | null;
  quality: QualityModel;
  customFormats?: { id: number; name: string }[];
  customFormatScore: number;
  size: number;
  title: string;
  sizeleft: number;
  /** C# `TimeSpan?` -- ported as milliseconds-or-null, matching `QueueItem.timeleft`'s own convention. */
  timeleft: number | null;
  /** ISO 8601 string, or null. */
  estimatedCompletionTime: string | null;
  status: string;
  trackedDownloadStatus: TrackedDownloadStatus | null;
  trackedDownloadState: TrackedDownloadState | null;
  statusMessages: TrackedDownloadStatusMessage[];
  errorMessage: string | null;
  downloadId: string | null;
  protocol: DownloadProtocol;
  downloadClient: string | null;
  downloadClientHasPostImportCategory: boolean;
  indexer: string;
  outputPath: string | null;
  downloadForced: boolean;
}

/**
 * Ported from `QueueResourceMapper.ToResource(this Queue model, bool
 * includeAuthor, bool includeBook)`.
 *
 * `model.RemoteBook?.Author?.QualityProfile?.Value?.CalculateCustomFormatScore(customFormats)`
 * -- `remoteBook.author` here (`parser/model/remoteBook.ts`'s real
 * `RemoteBook`) has no hydrated `qualityProfile` navigation property (this
 * port's `Author` model only stores `qualityProfileId`, see
 * books/models.ts), so the caller supplies an already-resolved
 * `QualityProfile | undefined` for the score calculation (`undefined` when
 * the queue item's remote-book/author/profile chain is null anywhere along
 * it, matching the C#`?.` short-circuit-to-null which
 * `CalculateCustomFormatScore` is never called for, defaulting the score to
 * 0 via the trailing `?? 0`).
 */
export function toQueueResource(
  queueItem: QueueItem,
  includeAuthor: boolean,
  includeBook: boolean,
  qualityProfile: QualityProfile | undefined
): QueueResource {
  const customFormats = queueItem.remoteBook?.customFormats;
  const customFormatScore = qualityProfile
    ? calculateCustomFormatScore(qualityProfile, (customFormats ?? []) as CustomFormat[])
    : 0;

  return {
    id: queueItem.id,
    authorId: queueItem.author?.id,
    bookId: queueItem.book?.id,
    author: includeAuthor && queueItem.author ? authorToResource(queueItem.author) : null,
    book: includeBook && queueItem.book ? bookToResource(queueItem.book) : null,
    quality: queueItem.quality,
    customFormats: customFormats?.map((f) => toCustomFormatResource(f as CustomFormat)),
    customFormatScore,
    size: queueItem.size,
    title: queueItem.title,
    sizeleft: queueItem.sizeleft,
    timeleft: queueItem.timeleft,
    estimatedCompletionTime: queueItem.estimatedCompletionTime,
    // Ported: `model.Status.FirstCharToLower()` -- QueueItem.status is
    // already lowercased at the source (queue/queueService.ts's
    // downloadItemStatusToString + this port's status convention), matching
    // NzbDrone.Common.Extensions.StringExtensions.FirstCharToLower's effect
    // on the enum-name string the real C# source lowercases at this mapper.
    status: lowercaseFirstChar(queueItem.status),
    trackedDownloadStatus: queueItem.trackedDownloadStatus,
    trackedDownloadState: queueItem.trackedDownloadState,
    statusMessages: queueItem.statusMessages,
    errorMessage: queueItem.errorMessage,
    downloadId: queueItem.downloadId,
    protocol: queueItem.protocol,
    downloadClient: queueItem.downloadClient,
    downloadClientHasPostImportCategory: queueItem.downloadClientHasPostImportCategory,
    indexer: queueItem.indexer,
    outputPath: queueItem.outputPath,
    downloadForced: queueItem.downloadForced,
  };
}

/** Ported from `NzbDrone.Common.Extensions.StringExtensions.FirstCharToLower`. */
function lowercaseFirstChar(value: string): string {
  if (value.length === 0) {
    return value;
  }
  return value[0]!.toLowerCase() + value.slice(1);
}

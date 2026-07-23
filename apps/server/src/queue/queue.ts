import type { ModelBase } from "../db/model-base.js";
import type { Author, Book } from "../books/index.js";
import type { QualityModel } from "../qualities/qualityModel.js";
import type { RemoteBook } from "../parser/model/remoteBook.js";
import type { DownloadProtocol } from "../indexers/DownloadProtocol.js";
import {
  TrackedDownloadState,
  TrackedDownloadStatus,
} from "../download-tracking/tracked-downloads/trackedDownload.js";
import type { TrackedDownloadStatusMessage } from "../download-tracking/tracked-downloads/trackedDownloadStatusMessage.js";

/**
 * Ported from NzbDrone.Core/Queue/Queue.cs.
 *
 * Named `QueueItem` here, not `Queue`: `Queue` would collide with the
 * built-in JS `Queue`-shaped naming conventions this port avoids, and more
 * concretely with this very module's own directory/file name
 * (`queue/queue.ts`) and the `IQueueService`/`QueueService` class this file
 * also declares -- `import { Queue } from "./queue.js"` inside
 * `queue.ts`/`queueService.ts` itself reads confusingly against a type
 * named identically to the module. C#'s `NzbDrone.Core.Queue.Queue` type
 * doesn't have this problem since C# namespaces and type names don't
 * collide with file names the way ESM imports would highlight here.
 * `decision-engine/queue.ts`'s existing forward-ref (`QueueItem`,
 * `QueueServiceLike`) independently chose the same name for the same
 * reason -- this is the real, non-forward-ref version of that shape.
 */
export interface QueueItem extends ModelBase {
  author: Author | null;
  book: Book | null;
  quality: QualityModel;
  size: number;
  title: string;
  sizeleft: number;
  /** Milliseconds, matching C#'s `TimeSpan? Timeleft` -- see this port's established `TimeSpan?` convention (e.g. `DownloadClientItem.remainingTime`). */
  timeleft: number | null;
  /** ISO 8601 string, or null. */
  estimatedCompletionTime: string | null;
  status: string;
  trackedDownloadStatus: TrackedDownloadStatus | null;
  trackedDownloadState: TrackedDownloadState | null;
  statusMessages: TrackedDownloadStatusMessage[];
  /**
   * `string` (not `| null`) in the real C# declaration, but genuinely
   * `null` at runtime for a pending (not-yet-downloading) queue item -- C#
   * reference types default to `null` when unset, and
   * `PendingReleaseService.GetPendingQueue()`'s real object-initializer
   * leaves `DownloadId`/`DownloadClient`/`Indexer` sourced from
   * `pendingRelease.RemoteBook.Release.Indexer` (never null in practice for
   * that one) but `DownloadId`/`OutputPath` genuinely unset (default
   * `null`) -- verified directly against that method's real source rather
   * than assumed from the C# property's declared type alone.
   */
  downloadId: string | null;
  remoteBook: RemoteBook | null;
  protocol: DownloadProtocol;
  downloadClient: string | null;
  downloadClientHasPostImportCategory: boolean;
  indexer: string;
  outputPath: string | null;
  errorMessage: string | null;
  downloadForced: boolean;
}

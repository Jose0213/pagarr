import type { DownloadProtocol } from "../indexers/DownloadProtocol.js";
import type { Author, Book } from "../books/models.js";
import type { QualityModel } from "../qualities/qualityModel.js";
import type { RemoteBook } from "../parser/model/remoteBook.js";
import type {
  TrackedDownloadState,
  TrackedDownloadStatus,
} from "./tracked-downloads/trackedDownload.js";
import type { TrackedDownloadStatusMessage } from "./tracked-downloads/trackedDownloadStatusMessage.js";

/**
 * Forward-reference for `NzbDrone.Core/Queue/Queue.cs`. The `Queue` module
 * (UI-facing "what's currently downloading" projection) is Phase 4 (see
 * PORT_PLAN.md) and not in this worktree's scope -- `PendingReleaseService`
 * is the only real C# source in this module's scope that constructs one
 * (`GetPendingQueue()`), so this is a minimal local stand-in copied
 * field-for-field from the real C# class, matching the same forward-ref
 * pattern `decision-engine/queue.ts` already uses for DecisionEngine's own
 * (narrower) needs. When `Queue` lands, this should be deleted in favor of
 * importing the real type.
 */
export interface QueueItem {
  id: number;
  author: Author;
  book: Book;
  quality: QualityModel | null;
  /** C# `decimal Size`. */
  size: number;
  title: string;
  /** C# `decimal Sizeleft`. */
  sizeleft: number;
  /** Milliseconds. Ported from C# `TimeSpan? Timeleft`. */
  timeleftMs: number | null;
  /** ISO 8601 string. Ported from C# `DateTime? EstimatedCompletionTime`. */
  estimatedCompletionTime: string | null;
  status: string;
  trackedDownloadStatus: TrackedDownloadStatus | null;
  trackedDownloadState: TrackedDownloadState | null;
  statusMessages: TrackedDownloadStatusMessage[];
  downloadId: string | null;
  remoteBook: RemoteBook;
  protocol: DownloadProtocol;
  downloadClient: string | null;
  downloadClientHasPostImportCategory: boolean;
  indexer: string | null;
  outputPath: string | null;
  errorMessage: string | null;
  downloadForced: boolean;
}

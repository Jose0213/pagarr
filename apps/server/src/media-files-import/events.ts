import type { BookFile } from "./bookFile.js";
import type { DeleteMediaFileReason } from "./deleteMediaFileReason.js";

/**
 * Ported from NzbDrone.Core/MediaFiles/Events/{BookFileAddedEvent,
 * BookFileDeletedEvent}.cs. Same plain-data-class + narrowed-aggregator
 * pattern as `books/events.ts` (see that file's doc comment) -- Messaging
 * (Phase 4) isn't ported yet.
 *
 * `TrackImportedEvent`/`TrackImportFailedEvent` (also in
 * NzbDrone.Core/MediaFiles/Events/) are ALSO ported here since
 * `ImportApprovedBooks`/`DownloadedBooksImportService` (both in this
 * module's scope) publish them.
 */

export class BookFileAddedEvent {
  constructor(public readonly bookFile: BookFile) {}
}

export class BookFileDeletedEvent {
  constructor(
    public readonly bookFile: BookFile,
    public readonly reason: DeleteMediaFileReason
  ) {}
}

/**
 * Ported from NzbDrone.Core/MediaFiles/Events/TrackImportedEvent.cs.
 * `LocalBook`/`BookFile`/`DownloadClientItem` typed loosely (`unknown`)
 * here to avoid a circular import with importDecisionMaker.ts/bookFile.ts
 * at the barrel level -- callers construct this with the real types, TS
 * structural typing means no explicit cast is needed at call sites that
 * already have the concrete types in scope.
 */
export class TrackImportedEvent<TLocalBook = unknown, TDownloadClientItem = unknown> {
  constructor(
    public readonly trackInfo: TLocalBook,
    public readonly importedTrack: BookFile,
    public readonly oldFiles: BookFile[],
    public readonly newDownload: boolean,
    public readonly downloadClientItem: TDownloadClientItem | null
  ) {}
}

/** Ported from NzbDrone.Core/MediaFiles/Events/TrackImportFailedEvent.cs. */
export class TrackImportFailedEvent<TLocalBook = unknown, TDownloadClientItem = unknown> {
  constructor(
    public readonly cause: unknown,
    public readonly trackInfo: TLocalBook | null,
    public readonly newDownload: boolean,
    public readonly downloadClientItem: TDownloadClientItem | null
  ) {}
}

export type MediaFilesDomainEvent =
  BookFileAddedEvent | BookFileDeletedEvent | TrackImportedEvent | TrackImportFailedEvent;

/** Ported narrowing of db/events.ts's IEventAggregator to this module's domain event union -- same pattern as books/events.ts's IBooksEventAggregator. */
export interface IMediaFilesEventAggregator {
  publishEvent(event: MediaFilesDomainEvent): void;
}

/** No-op aggregator, same role as db/events.ts's NullEventAggregator. */
export class NullMediaFilesEventAggregator implements IMediaFilesEventAggregator {
  publishEvent(): void {
    // Intentional no-op.
  }
}

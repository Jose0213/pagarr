import type { LocalEdition } from "../../../parser/model/localEdition.js";
import { Decision } from "../../../decision-engine/decision.js";
import type {
  IImportDecisionEngineSpecification,
  DownloadClientItemLike,
} from "../importDecisionEngineSpecification.js";
import { EntityHistoryEventTypeLike, type HistoryLookup } from "../historyLike.js";

/**
 * Ported from the slice of `IMediaFileService`/`BookFile` this
 * specification reads (`bookRelease.BookFiles?.Value?.Any()`) -- the
 * real, in-scope `mediaFileService.ts` (same module) satisfies this
 * directly via `getFilesByEdition`.
 */
export interface EditionFileLookup {
  getFilesByEdition(editionId: number): { id: number }[];
}

/** Ported from NzbDrone.Core/MediaFiles/BookImport/Specifications/AlreadyImportedSpecification.cs. */
export class AlreadyImportedSpecification implements IImportDecisionEngineSpecification<LocalEdition> {
  constructor(
    private readonly historyService: HistoryLookup,
    private readonly mediaFileService: EditionFileLookup
  ) {}

  isSatisfiedBy(
    localBookRelease: LocalEdition,
    downloadClientItem: DownloadClientItemLike | null
  ): Decision {
    if (downloadClientItem === null) {
      return Decision.accept();
    }

    const bookRelease = localBookRelease.edition;

    if (bookRelease === null) {
      return Decision.accept();
    }

    // Ported from `(!bookRelease.BookFiles?.Value?.Any()) ?? true`: this
    // port's Edition has no `bookFiles` LazyLoaded field (see
    // populateMatch.ts's doc comment on the same gap), so the "does this
    // edition have any files" check is answered via the real, ported
    // `MediaFileService.getFilesByEdition` instead of a LazyLoaded
    // property read -- same observable result (skip the already-imported
    // check when the edition has no files on disk yet), sourced from the
    // real repository rather than an unavailable in-memory field.
    if (this.mediaFileService.getFilesByEdition(bookRelease.id).length === 0) {
      return Decision.accept();
    }

    const bookHistory = this.historyService.getByBook(bookRelease.bookId, null);
    const lastImported = bookHistory.find(
      (h) => h.eventType === EntityHistoryEventTypeLike.BookFileImported
    );
    const lastGrabbed = bookHistory.find((h) => h.eventType === EntityHistoryEventTypeLike.Grabbed);

    if (lastImported === undefined) {
      return Decision.accept();
    }

    if (
      lastGrabbed !== undefined &&
      new Date(lastGrabbed.date).getTime() > new Date(lastImported.date).getTime()
    ) {
      return Decision.accept();
    }

    if (lastImported.downloadId === downloadClientItem.downloadId) {
      return Decision.reject(`Book already imported at ${lastImported.date}`);
    }

    return Decision.accept();
  }
}

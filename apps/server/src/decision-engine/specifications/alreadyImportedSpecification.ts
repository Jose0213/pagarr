import type { IConfigService } from "../../config/configService.js";
import { Decision } from "../decision.js";
import { EntityHistoryEventType, type HistoryServiceLike } from "../history.js";
import type { MediaFileServiceLike } from "../mediaFile.js";
import { RejectionType } from "../rejectionType.js";
import {
  DownloadProtocol,
  isTorrentInfo,
  type RemoteBook,
  type SearchCriteriaBase,
} from "../remoteBook.js";
import { SpecificationPriority } from "../specificationPriority.js";
import type { IDecisionEngineSpecification } from "./decisionEngineSpecification.js";

/** Ported from NzbDrone.Core/DecisionEngine/Specifications/AlreadyImportedSpecification.cs. */
export class AlreadyImportedSpecification implements IDecisionEngineSpecification {
  readonly priority = SpecificationPriority.Database;
  readonly type = RejectionType.Permanent;

  constructor(
    private readonly historyService: HistoryServiceLike,
    private readonly configService: IConfigService,
    private readonly mediaFileService: MediaFileServiceLike
  ) {}

  isSatisfiedBy(subject: RemoteBook, _searchCriteria: SearchCriteriaBase | null): Decision {
    const cdhEnabled = this.configService.enableCompletedDownloadHandling;

    if (!cdhEnabled) {
      return Decision.accept();
    }

    for (const book of subject.books) {
      const bookFiles = this.mediaFileService.getFilesByBook(book.id);

      if (bookFiles.length === 0) {
        continue;
      }

      const historyForBook = this.historyService.getByBook(book.id, null);
      const lastGrabbed = historyForBook.find(
        (h) => h.eventType === EntityHistoryEventType.Grabbed
      );

      if (!lastGrabbed) {
        continue;
      }

      const imported = historyForBook.find(
        (h) =>
          h.eventType === EntityHistoryEventType.BookFileImported &&
          h.downloadId === lastGrabbed.downloadId
      );

      if (!imported) {
        continue;
      }

      // This is really only a guard against redownloading the same release over
      // and over when the grabbed and imported qualities do not match, if they do
      // match skip this check.
      if (
        lastGrabbed.quality.quality.id === imported.quality.quality.id &&
        lastGrabbed.quality.revision.equals(imported.quality.revision)
      ) {
        continue;
      }

      const release = subject.release;

      if (release.downloadProtocol === DownloadProtocol.Torrent && isTorrentInfo(release)) {
        if (release.infoHash != null && release.infoHash.toUpperCase() === lastGrabbed.downloadId) {
          return Decision.reject("Has same torrent hash as a grabbed and imported release");
        }
      }

      // Only based on title because a release with the same title on another indexer/released at
      // a different time very likely has the exact same content and we don't need to also try it.
      if (release.title.toLowerCase() === lastGrabbed.sourceTitle.toLowerCase()) {
        return Decision.reject("Has same release name as a grabbed and imported release");
      }
    }

    return Decision.accept();
  }
}

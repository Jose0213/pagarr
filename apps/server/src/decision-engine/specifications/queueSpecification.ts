import type { IConfigService } from "../../config/configService.js";
import { Decision } from "../decision.js";
import type { CustomFormatCalculationServiceLike } from "../mediaFile.js";
import { TrackedDownloadState, type QueueServiceLike } from "../queue.js";
import { RejectionType } from "../rejectionType.js";
import type { RemoteBook, SearchCriteriaBase } from "../remoteBook.js";
import { SpecificationPriority } from "../specificationPriority.js";
import type { IDecisionEngineSpecification } from "./decisionEngineSpecification.js";
import type { UpgradableSpecification } from "./upgradableSpecification.js";

/** Ported from NzbDrone.Core/DecisionEngine/Specifications/QueueSpecification.cs. */
export class QueueSpecification implements IDecisionEngineSpecification {
  readonly priority = SpecificationPriority.Default;
  readonly type = RejectionType.Permanent;

  constructor(
    private readonly queueService: QueueServiceLike,
    private readonly upgradableSpecification: UpgradableSpecification,
    private readonly formatService: CustomFormatCalculationServiceLike,
    private readonly configService: IConfigService
  ) {}

  isSatisfiedBy(subject: RemoteBook, _searchCriteria: SearchCriteriaBase | null): Decision {
    const queue = this.queueService.getQueue();
    const subjectBookIds = new Set(subject.books.map((b) => b.id));

    const matchingBook = queue.filter(
      (q) =>
        q.remoteBook?.author != null &&
        q.remoteBook.author.id === subject.author.id &&
        q.remoteBook.books.some((b) => subjectBookIds.has(b.id))
    );

    for (const queueItem of matchingBook) {
      const remoteBook = queueItem.remoteBook;
      if (!remoteBook) {
        continue;
      }

      const qualityProfile = subject.author.qualityProfile;

      // To avoid a race make sure it's not FailedPending (failed awaiting removal/search).
      // Failed items (already searching for a replacement) won't be part of the queue since
      // it's a copy, of the tracked download, not a reference.
      if (queueItem.trackedDownloadState === TrackedDownloadState.DownloadFailedPending) {
        continue;
      }

      const queuedItemCustomFormats = this.formatService.parseCustomFormatForRemoteBook(
        remoteBook,
        queueItem.size
      );

      if (
        !this.upgradableSpecification.cutoffNotMet(
          qualityProfile,
          [remoteBook.parsedBookInfo.quality],
          queuedItemCustomFormats,
          subject.parsedBookInfo.quality
        )
      ) {
        return Decision.reject(
          `Release in queue already meets cutoff: ${remoteBook.parsedBookInfo.quality.quality.name}`
        );
      }

      if (
        !this.upgradableSpecification.isUpgradable(
          qualityProfile,
          remoteBook.parsedBookInfo.quality,
          queuedItemCustomFormats,
          subject.parsedBookInfo.quality,
          subject.customFormats
        )
      ) {
        return Decision.reject(
          `Release in queue is of equal or higher preference: ${remoteBook.parsedBookInfo.quality.quality.name}`
        );
      }

      if (
        !this.upgradableSpecification.isUpgradeAllowed(
          qualityProfile,
          remoteBook.parsedBookInfo.quality,
          queuedItemCustomFormats,
          subject.parsedBookInfo.quality,
          subject.customFormats
        )
      ) {
        return Decision.reject(
          "Another release is queued and the Quality profile does not allow upgrades"
        );
      }

      if (
        this.upgradableSpecification.isRevisionUpgrade(
          remoteBook.parsedBookInfo.quality,
          subject.parsedBookInfo.quality
        )
      ) {
        if (this.configService.downloadPropersAndRepacks === "DoNotUpgrade") {
          return Decision.reject("Proper downloading is disabled");
        }
      }
    }

    return Decision.accept();
  }
}

import type { IConfigService } from "../../../config/configService.js";
import { Decision } from "../../decision.js";
import type { HistoryServiceLike } from "../../history.js";
import { EntityHistoryEventType } from "../../history.js";
import type { CustomFormatCalculationServiceLike } from "../../mediaFile.js";
import { RejectionType } from "../../rejectionType.js";
import type { RemoteBook, SearchCriteriaBase } from "../../remoteBook.js";
import { SpecificationPriority } from "../../specificationPriority.js";
import type { IDecisionEngineSpecification } from "../decisionEngineSpecification.js";
import type { UpgradableSpecification } from "../upgradableSpecification.js";

const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;

/** Ported from NzbDrone.Core/DecisionEngine/Specifications/RssSync/HistorySpecification.cs. */
export class HistorySpecification implements IDecisionEngineSpecification {
  readonly priority = SpecificationPriority.Database;
  readonly type = RejectionType.Permanent;

  constructor(
    private readonly historyService: HistoryServiceLike,
    private readonly upgradableSpecification: UpgradableSpecification,
    private readonly formatService: CustomFormatCalculationServiceLike,
    private readonly configService: IConfigService
  ) {}

  isSatisfiedBy(subject: RemoteBook, searchCriteria: SearchCriteriaBase | null): Decision {
    if (searchCriteria != null) {
      return Decision.accept();
    }

    const cdhEnabled = this.configService.enableCompletedDownloadHandling;

    for (const book of subject.books) {
      const mostRecent = this.historyService.mostRecentForBook(book.id);

      if (mostRecent != null && mostRecent.eventType === EntityHistoryEventType.Grabbed) {
        const recent = new Date(mostRecent.date).getTime() > Date.now() - TWELVE_HOURS_MS;

        if (!recent && cdhEnabled) {
          continue;
        }

        // Author will be the same as the one in history since it's the same book.
        // Instead of fetching the author from the DB reuse the known author.
        const customFormats = this.formatService.parseCustomFormatForHistory(
          mostRecent,
          subject.author
        );

        const cutoffUnmet = this.upgradableSpecification.cutoffNotMet(
          subject.author.qualityProfile,
          [mostRecent.quality],
          customFormats,
          subject.parsedBookInfo.quality
        );

        const upgradeable = this.upgradableSpecification.isUpgradable(
          subject.author.qualityProfile,
          mostRecent.quality,
          customFormats,
          subject.parsedBookInfo.quality,
          subject.customFormats
        );

        if (!cutoffUnmet) {
          if (recent) {
            return Decision.reject(
              `Recent grab event in history already meets cutoff: ${mostRecent.quality.quality.name}`
            );
          }

          return Decision.reject(
            `CDH is disabled and grab event in history already meets cutoff: ${mostRecent.quality.quality.name}`
          );
        }

        if (!upgradeable) {
          if (recent) {
            return Decision.reject(
              `Recent grab event in history is of equal or higher quality: ${mostRecent.quality.quality.name}`
            );
          }

          return Decision.reject(
            `CDH is disabled and grab event in history is of equal or higher quality: ${mostRecent.quality.quality.name}`
          );
        }
      }
    }

    return Decision.accept();
  }
}

import type { IConfigService } from "../../../config/configService.js";
import { Decision } from "../../decision.js";
import type { MediaFileServiceLike } from "../../mediaFile.js";
import { RejectionType } from "../../rejectionType.js";
import type { RemoteBook, SearchCriteriaBase } from "../../remoteBook.js";
import { SpecificationPriority } from "../../specificationPriority.js";
import type { IDecisionEngineSpecification } from "../decisionEngineSpecification.js";
import type { UpgradableSpecification } from "../upgradableSpecification.js";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/** Ported from NzbDrone.Core/DecisionEngine/Specifications/RssSync/ProperSpecification.cs. */
export class ProperSpecification implements IDecisionEngineSpecification {
  readonly priority = SpecificationPriority.Default;
  readonly type = RejectionType.Permanent;

  constructor(
    private readonly upgradableSpecification: UpgradableSpecification,
    private readonly configService: IConfigService,
    private readonly mediaFileService: MediaFileServiceLike
  ) {}

  isSatisfiedBy(subject: RemoteBook, searchCriteria: SearchCriteriaBase | null): Decision {
    if (searchCriteria != null) {
      return Decision.accept();
    }

    const downloadPropersAndRepacks = this.configService.downloadPropersAndRepacks;

    if (downloadPropersAndRepacks === "DoNotPrefer") {
      return Decision.accept();
    }

    // C# `DateTime.Today.AddDays(-7)`: midnight today, minus 7 days.
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const sevenDaysAgo = today.getTime() - SEVEN_DAYS_MS;

    for (const book of subject.books) {
      const bookFiles = this.mediaFileService.getFilesByBook(book.id);

      for (const file of bookFiles) {
        if (
          this.upgradableSpecification.isRevisionUpgrade(
            file.quality,
            subject.parsedBookInfo.quality
          )
        ) {
          if (downloadPropersAndRepacks === "DoNotUpgrade") {
            return Decision.reject("Proper downloading is disabled");
          }

          if (new Date(file.dateAdded).getTime() < sevenDaysAgo) {
            return Decision.reject("Proper for old file");
          }
        }
      }
    }

    return Decision.accept();
  }
}

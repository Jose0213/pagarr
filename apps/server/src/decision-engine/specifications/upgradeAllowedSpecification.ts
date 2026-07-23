import { Decision } from "../decision.js";
import type { CustomFormatCalculationServiceLike, MediaFileServiceLike } from "../mediaFile.js";
import { RejectionType } from "../rejectionType.js";
import type { RemoteBook, SearchCriteriaBase } from "../remoteBook.js";
import { SpecificationPriority } from "../specificationPriority.js";
import type { IDecisionEngineSpecification } from "./decisionEngineSpecification.js";
import type { UpgradableSpecification } from "./upgradableSpecification.js";

/**
 * Ported from NzbDrone.Core/DecisionEngine/Specifications/UpgradeAllowedSpecification.cs.
 * See cutoffSpecification.ts's header comment for the same
 * `book.BookFiles.Value` -> `MediaFileServiceLike.getFilesByBook` deviation.
 */
export class UpgradeAllowedSpecification implements IDecisionEngineSpecification {
  readonly priority = SpecificationPriority.Default;
  readonly type = RejectionType.Permanent;

  constructor(
    private readonly upgradableSpecification: UpgradableSpecification,
    private readonly formatService: CustomFormatCalculationServiceLike,
    private readonly mediaFileService: MediaFileServiceLike
  ) {}

  isSatisfiedBy(subject: RemoteBook, _searchCriteria: SearchCriteriaBase | null): Decision {
    const qualityProfile = subject.author.qualityProfile;

    for (const book of subject.books) {
      for (const file of this.mediaFileService.getFilesByBook(book.id)) {
        if (file == null) {
          continue;
        }

        const fileCustomFormats = this.formatService.parseCustomFormatForFile(file, subject.author);

        if (
          !this.upgradableSpecification.isUpgradeAllowed(
            qualityProfile,
            file.quality,
            fileCustomFormats,
            subject.parsedBookInfo.quality,
            subject.customFormats
          )
        ) {
          return Decision.reject("Existing files and the Quality profile does not allow upgrades");
        }
      }
    }

    return Decision.accept();
  }
}

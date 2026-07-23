import type { IConfigService } from "../../config/configService.js";
import { Decision } from "../decision.js";
import type { MediaFileServiceLike } from "../mediaFile.js";
import { RejectionType } from "../rejectionType.js";
import type { RemoteBook, SearchCriteriaBase } from "../remoteBook.js";
import { SpecificationPriority } from "../specificationPriority.js";
import type { IDecisionEngineSpecification } from "./decisionEngineSpecification.js";
import type { UpgradableSpecification } from "./upgradableSpecification.js";

/** Ported from NzbDrone.Core/DecisionEngine/Specifications/RepackSpecification.cs. */
export class RepackSpecification implements IDecisionEngineSpecification {
  readonly priority = SpecificationPriority.Database;
  readonly type = RejectionType.Permanent;

  constructor(
    private readonly mediaFileService: MediaFileServiceLike,
    private readonly upgradableSpecification: UpgradableSpecification,
    private readonly configService: IConfigService
  ) {}

  isSatisfiedBy(subject: RemoteBook, _searchCriteria: SearchCriteriaBase | null): Decision {
    if (!subject.parsedBookInfo.quality.revision.isRepack) {
      return Decision.accept();
    }

    const downloadPropersAndRepacks = this.configService.downloadPropersAndRepacks;

    if (downloadPropersAndRepacks === "DoNotPrefer") {
      return Decision.accept();
    }

    for (const book of subject.books) {
      const releaseGroup = subject.parsedBookInfo.releaseGroup;
      const bookFiles = this.mediaFileService.getFilesByBook(book.id);

      for (const file of bookFiles) {
        if (
          this.upgradableSpecification.isRevisionUpgrade(
            file.quality,
            subject.parsedBookInfo.quality
          )
        ) {
          if (downloadPropersAndRepacks === "DoNotUpgrade") {
            return Decision.reject("Repack downloading is disabled");
          }

          const fileReleaseGroup = file.releaseGroup;

          if (!fileReleaseGroup || fileReleaseGroup.trim() === "") {
            return Decision.reject("Unable to determine release group for the existing file");
          }

          if (!releaseGroup || releaseGroup.trim() === "") {
            return Decision.reject("Unable to determine release group for this release");
          }

          if (fileReleaseGroup.toLowerCase() !== releaseGroup.toLowerCase()) {
            return Decision.reject(
              `Release is a repack for a different release group. Release Group: ${releaseGroup}. File release group: ${fileReleaseGroup}`
            );
          }
        }
      }
    }

    return Decision.accept();
  }
}

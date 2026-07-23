import { getIndex } from "../../profiles/qualities/qualityProfile.js";
import type { QualityModel } from "../../qualities/qualityModel.js";
import { Decision } from "../decision.js";
import type { CustomFormatCalculationServiceLike, MediaFileServiceLike } from "../mediaFile.js";
import { RejectionType } from "../rejectionType.js";
import type { RemoteBook, SearchCriteriaBase } from "../remoteBook.js";
import { SpecificationPriority } from "../specificationPriority.js";
import type { IDecisionEngineSpecification } from "./decisionEngineSpecification.js";
import type { UpgradableSpecification } from "./upgradableSpecification.js";

/**
 * Ported from NzbDrone.Core/DecisionEngine/Specifications/CutoffSpecification.cs.
 *
 * DEVIATION: the real C# reads existing files via `book.BookFiles.Value`
 * (a `LazyLoaded<List<BookFile>>` directly on `Book`). This port's `Book`
 * model (books/models.ts) doesn't carry that field -- MediaFiles is a later
 * phase (Phase 3) not ported yet, see mediaFile.ts's header comment -- so
 * this reads files via an injected `MediaFileServiceLike.getFilesByBook`
 * instead, exactly like the real C#'s own QueueSpecification/
 * RepackSpecification/UpgradeDiskSpecification/UpgradeAllowedSpecification
 * already do (those inject `IMediaFileService` directly rather than reading
 * `BookFiles.Value`). Behaviorally identical either way -- both resolve to
 * "every file currently on disk for this book".
 */
export class CutoffSpecification implements IDecisionEngineSpecification {
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
        const currentQualities: QualityModel[] = [file.quality];
        const customFormats = this.formatService.parseCustomFormatForFile(file);

        if (
          !this.upgradableSpecification.cutoffNotMet(
            qualityProfile,
            currentQualities,
            customFormats,
            subject.parsedBookInfo.quality
          )
        ) {
          const qualityCutoffIndex = getIndex(qualityProfile, qualityProfile.cutoff);
          const qualityCutoff = qualityProfile.items[qualityCutoffIndex.index];

          return Decision.reject(
            `Existing files meets cutoff: ${qualityCutoff?.name ?? qualityCutoff?.quality?.name}`
          );
        }
      }
    }

    return Decision.accept();
  }
}

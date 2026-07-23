import { Decision } from "../decision.js";
import type { CustomFormatCalculationServiceLike, MediaFileServiceLike } from "../mediaFile.js";
import { RejectionType } from "../rejectionType.js";
import type { RemoteBook, SearchCriteriaBase } from "../remoteBook.js";
import { SpecificationPriority } from "../specificationPriority.js";
import type { IDecisionEngineSpecification } from "./decisionEngineSpecification.js";
import type { UpgradableSpecification } from "./upgradableSpecification.js";

/**
 * Ported from NzbDrone.Core/DecisionEngine/Specifications/UpgradeDiskSpecification.cs.
 * See cutoffSpecification.ts's header comment for the same
 * `book.BookFiles.Value` -> `MediaFileServiceLike.getFilesByBook` deviation.
 *
 * NOTE (faithful port of a real quirk): the C# source calls
 * `_upgradableSpecification.IsUpgradable(subject.Author.QualityProfile, ...)`
 * -- passing the *LazyLoaded<QualityProfile> wrapper itself*, not
 * `.Value` -- while every other specification (CutoffSpecification,
 * QueueSpecification, etc.) correctly passes `.Value`. This compiles in C#
 * only because `IUpgradableSpecification.IsUpgradable`'s first parameter is
 * typed as the LazyLoaded's implicit-conversion target... actually
 * `LazyLoaded<T>` has an implicit operator to `T` (`public static implicit
 * operator T(LazyLoaded<T> lazy) => lazy.Value`), so this is NOT a bug --
 * the implicit conversion makes `subject.Author.QualityProfile` behave
 * exactly like `subject.Author.QualityProfile.Value` at the call site.
 * Ported straightforwardly as `subject.author.qualityProfile` (this port's
 * `AuthorWithQualityProfile.qualityProfile` is already the resolved value,
 * no wrapper), so no special-casing is needed here.
 */
export class UpgradeDiskSpecification implements IDecisionEngineSpecification {
  readonly priority = SpecificationPriority.Default;
  readonly type = RejectionType.Permanent;

  constructor(
    private readonly upgradableSpecification: UpgradableSpecification,
    private readonly formatService: CustomFormatCalculationServiceLike,
    private readonly mediaFileService: MediaFileServiceLike
  ) {}

  isSatisfiedBy(subject: RemoteBook, _searchCriteria: SearchCriteriaBase | null): Decision {
    for (const book of subject.books) {
      for (const file of this.mediaFileService.getFilesByBook(book.id)) {
        if (file == null) {
          return Decision.accept();
        }

        const customFormats = this.formatService.parseCustomFormatForFile(file);

        if (
          !this.upgradableSpecification.isUpgradable(
            subject.author.qualityProfile,
            file.quality,
            customFormats,
            subject.parsedBookInfo.quality,
            subject.customFormats
          )
        ) {
          return Decision.reject(
            `Existing files on disk is of equal or higher preference: ${file.quality.quality.name}`
          );
        }
      }
    }

    return Decision.accept();
  }
}

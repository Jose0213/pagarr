import type { LocalBook } from "../../../parser/model/localBook.js";
import { Decision } from "../../../decision-engine/decision.js";
import { QualityModelComparer } from "../../../qualities/qualityModelComparer.js";
import {
  asQualityProfileLike,
  type QualityProfile,
} from "../../../profiles/qualities/qualityProfile.js";
import type {
  IImportDecisionEngineSpecification,
  DownloadClientItemLike,
} from "../importDecisionEngineSpecification.js";
import type { CustomFormatCalculationServiceLike } from "../../../decision-engine/mediaFile.js";
import type { QualityModel } from "../../../qualities/qualityModel.js";

/** Ported from `NzbDrone.Core.Qualities.ProperDownloadTypes` (already ported at `qualities/properDownloadTypes.ts`, a string-literal union, not a runtime enum object). */
import type { ProperDownloadTypes } from "../../../qualities/properDownloadTypes.js";

/** Ported from the slice of `IConfigService` this specification reads. */
export interface UpgradeConfigLookup {
  downloadPropersAndRepacks: ProperDownloadTypes;
}

/**
 * Ported from the slice of `IMediaFileService`/`BookFile` this
 * specification reads -- same "query the real repository, no bookFiles
 * field" substitution as sameFileSpecification.ts's `BookFileLookup`.
 */
export interface BookFileQualityLookup {
  getFilesByBook(bookId: number): { quality: QualityModel }[];
}

/** Ported from NzbDrone.Core/MediaFiles/BookImport/Specifications/UpgradeSpecification.cs. */
export class UpgradeSpecification implements IImportDecisionEngineSpecification<LocalBook> {
  constructor(
    private readonly configService: UpgradeConfigLookup,
    private readonly mediaFileService: BookFileQualityLookup,
    /** Unused by the C# source's actual method body (constructor-injected but never called in IsSatisfiedBy) -- kept for constructor-signature parity. */
    private readonly customFormatCalculationService?: CustomFormatCalculationServiceLike
  ) {}

  isSatisfiedBy(item: LocalBook, _downloadClientItem: DownloadClientItemLike | null): Decision {
    if (item.book === null) {
      return Decision.accept();
    }

    const files = this.mediaFileService.getFilesByBook(item.book.id);
    if (files.length === 0) {
      // No existing books, skip.  This guards against new authors not having a QualityProfile.
      return Decision.accept();
    }

    const downloadPropersAndRepacks = this.configService.downloadPropersAndRepacks;
    const qualityProfile = (item.author as { qualityProfile?: QualityProfile } | null)
      ?.qualityProfile;

    if (qualityProfile === undefined || item.quality === null) {
      return Decision.accept();
    }

    const qualityComparer = new QualityModelComparer(asQualityProfileLike(qualityProfile));

    for (const bookFile of files) {
      const qualityCompare = qualityComparer.compareQuality(
        item.quality.quality,
        bookFile.quality.quality
      );

      if (qualityCompare < 0) {
        return Decision.reject("Not an upgrade for existing book file(s)");
      }

      if (
        qualityCompare === 0 &&
        downloadPropersAndRepacks !== "DoNotPrefer" &&
        item.quality.revision.compareTo(bookFile.quality.revision) < 0
      ) {
        return Decision.reject("Not an upgrade for existing book file(s)");
      }
    }

    return Decision.accept();
  }
}

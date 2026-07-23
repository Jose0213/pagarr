import {
  asQualityProfileLike,
  lastAllowedQuality,
} from "../../../profiles/qualities/qualityProfile.js";
import type { DelayProfileService } from "../../../profiles/delay/delayProfileService.js";
import { DownloadProtocol as DelayProfileDownloadProtocol } from "../../../profiles/delay/delayProfile.js";
import { QualityModelComparer } from "../../../qualities/qualityModelComparer.js";
import { Decision } from "../../decision.js";
import type { MediaFileServiceLike } from "../../mediaFile.js";
import { RejectionType } from "../../rejectionType.js";
import {
  ageMinutes,
  DownloadProtocol,
  type RemoteBook,
  type SearchCriteriaBase,
} from "../../remoteBook.js";
import { SpecificationPriority } from "../../specificationPriority.js";
import type { IDecisionEngineSpecification } from "../decisionEngineSpecification.js";
import type { IUpgradableSpecification } from "../upgradableSpecification.js";

/**
 * Forward-ref for the slice of NzbDrone.Core/Download/Pending/IPendingReleaseService.cs
 * DecisionEngine calls (module not ported yet -- Download is Phase 3).
 */
export interface PendingReleaseServiceLike {
  /** Returns null if there is no pending release for this author/book set (C# returns `null` too, not an exception). */
  oldestPendingRelease(authorId: number, bookIds: number[]): RemoteBook | null;
}

/**
 * Maps this module's local `DownloadProtocol` (remoteBook.ts) to Profiles'
 * local `DownloadProtocol` (profiles/delay/delayProfile.ts) -- both are
 * separately-declared forward-refs for the same real C# enum
 * (NzbDrone.Core/Indexers/DownloadProtocol.cs) with identical numeric
 * values (Unknown=0, Usenet=1, Torrent=2), per each module's own
 * documented reasoning for not reaching into the other's internals.
 */
function toDelayProfileProtocol(protocol: DownloadProtocol): DelayProfileDownloadProtocol {
  return protocol;
}

/** Ported from NzbDrone.Core/DecisionEngine/Specifications/RssSync/DelaySpecification.cs. */
export class DelaySpecification implements IDecisionEngineSpecification {
  readonly priority = SpecificationPriority.Database;
  readonly type = RejectionType.Temporary;

  constructor(
    private readonly pendingReleaseService: PendingReleaseServiceLike,
    private readonly upgradableSpecification: IUpgradableSpecification,
    private readonly delayProfileService: DelayProfileService,
    private readonly mediaFileService: MediaFileServiceLike
  ) {}

  isSatisfiedBy(subject: RemoteBook, searchCriteria: SearchCriteriaBase | null): Decision {
    if (searchCriteria != null && searchCriteria.userInvokedSearch) {
      return Decision.accept();
    }

    const qualityProfile = subject.author.qualityProfile;
    const delayProfile = this.delayProfileService.bestForTags(new Set(subject.author.tags));
    const protocol = toDelayProfileProtocol(subject.release.downloadProtocol);
    const delay =
      protocol === DelayProfileDownloadProtocol.Torrent
        ? delayProfile.torrentDelay
        : delayProfile.usenetDelay;
    const isPreferredProtocol = protocol === delayProfile.preferredProtocol;

    if (delay === 0) {
      return Decision.accept();
    }

    const qualityComparer = new QualityModelComparer(asQualityProfileLike(qualityProfile));

    if (isPreferredProtocol) {
      for (const book of subject.books) {
        const bookFiles = this.mediaFileService.getFilesByBook(book.id);

        for (const file of bookFiles) {
          const currentQuality = file.quality;
          const newQuality = subject.parsedBookInfo.quality;
          const qualityCompare = qualityComparer.compareQuality(
            newQuality.quality,
            currentQuality.quality
          );

          if (qualityCompare === 0 && newQuality.revision.compareTo(currentQuality.revision) > 0) {
            return Decision.accept();
          }
        }
      }
    }

    // If quality meets or exceeds the best allowed quality in the profile accept it immediately
    if (delayProfile.bypassIfHighestQuality) {
      const bestQualityInProfile = lastAllowedQuality(qualityProfile);
      const isBestInProfile =
        qualityComparer.compareQuality(
          subject.parsedBookInfo.quality.quality,
          bestQualityInProfile
        ) >= 0;

      if (isBestInProfile && isPreferredProtocol) {
        return Decision.accept();
      }
    }

    // If quality meets or exceeds the best allowed quality in the profile accept it immediately
    if (delayProfile.bypassIfAboveCustomFormatScore) {
      const score = subject.customFormatScore;
      const minimum = delayProfile.minimumCustomFormatScore ?? 0;

      if (score >= minimum && isPreferredProtocol) {
        return Decision.accept();
      }
    }

    const bookIds = subject.books.map((e) => e.id);

    const oldest = this.pendingReleaseService.oldestPendingRelease(subject.author.id, bookIds);

    if (oldest != null && ageMinutes(oldest.release) > delay) {
      return Decision.accept();
    }

    if (ageMinutes(subject.release) < delay) {
      return Decision.reject("Waiting for better quality release");
    }

    return Decision.accept();
  }
}

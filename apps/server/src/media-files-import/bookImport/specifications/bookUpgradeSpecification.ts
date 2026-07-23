import type { LocalEdition } from "../../../parser/model/localEdition.js";
import { Decision } from "../../../decision-engine/decision.js";
import { QualityModelComparer } from "../../../qualities/qualityModelComparer.js";
import { asQualityProfileLike } from "../../../profiles/qualities/qualityProfile.js";
import type { QualityProfile } from "../../../profiles/qualities/qualityProfile.js";
import type {
  IImportDecisionEngineSpecification,
  DownloadClientItemLike,
} from "../importDecisionEngineSpecification.js";

/**
 * Ported from NzbDrone.Core/MediaFiles/BookImport/Specifications/AlbumUpgradeSpecification.cs.
 * C# class name is `BookUpgradeSpecification` (the file is misnamed
 * `AlbumUpgradeSpecification.cs`, a leftover from the Lidarr fork this
 * module was adapted from -- same "file name != class name" quirk as
 * ImportArtistDefaults.cs/aggregationFailedException.ts) -- ported under
 * the real class name.
 *
 * PRESERVED VERBATIM: the C# source's actual quality-downgrade check is
 * entirely commented out -- this specification ALWAYS accepts. Not a
 * porting mistake; the real upstream source is dead code here too. Kept
 * faithful per this module's task brief (preserve buggy-looking behavior,
 * don't silently fix it).
 */
export class BookUpgradeSpecification implements IImportDecisionEngineSpecification<LocalEdition> {
  isSatisfiedBy(item: LocalEdition, _downloadClientItem: DownloadClientItemLike | null): Decision {
    const qualityProfile = (
      item.edition?.book?.author as { qualityProfile?: QualityProfile } | undefined
    )?.qualityProfile;

    if (qualityProfile !== undefined) {
      const qualityComparer = new QualityModelComparer(asQualityProfileLike(qualityProfile));

      // min quality of all new tracks
      void item.localBooks
        .map((x) => x.quality)
        .sort((a, b) => (a && b ? qualityComparer.compare(a, b) : 0))[0];
    }

    // get minimum quality of existing release
    // var existingQualities = currentRelease.Value.Where(x => x.TrackFileId != 0).Select(x => x.TrackFile.Value.Quality);
    // if (existingQualities.Any())
    // {
    //     var existingMinQuality = existingQualities.OrderBy(x => x, qualityComparer).First();
    //     if (qualityComparer.Compare(existingMinQuality, newMinQuality) > 0)
    //     {
    //         return Decision.Reject("Not an upgrade for existing book file(s)");
    //     }
    // }
    return Decision.accept();
  }
}

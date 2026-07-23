import type { IConfigService } from "../config/configService.js";
import type { DelayProfileService } from "../profiles/delay/delayProfileService.js";
import { getIndex } from "../profiles/qualities/qualityProfile.js";
import type { DownloadDecision } from "./downloadDecision.js";
import { DownloadProtocol, getPeers, getSeeders } from "./remoteBook.js";

/**
 * Ported from NzbDrone.Core/DecisionEngine/DownloadDecisionComparer.cs.
 *
 * C# `IComparer<DownloadDecision>.Compare` + a list of small named delegate
 * comparers, run in order until one returns non-zero (`FirstOrDefault(result
 * => result != 0)`, defaulting to 0 if every comparer ties). Ported 1:1 as a
 * class with the same private comparer methods, run in the same order.
 */
export class DownloadDecisionComparer {
  constructor(
    private readonly configService: IConfigService,
    private readonly delayProfileService: DelayProfileService
  ) {}

  /** Ported from `Compare(DownloadDecision x, DownloadDecision y)`. */
  compare(x: DownloadDecision, y: DownloadDecision): number {
    const comparers: Array<(x: DownloadDecision, y: DownloadDecision) => number> = [
      this.compareQuality.bind(this),
      this.compareCustomFormatScore.bind(this),
      this.compareProtocol.bind(this),
      this.compareIndexerPriority.bind(this),
      this.comparePeersIfTorrent.bind(this),
      this.compareBookCount.bind(this),
      this.compareAgeIfUsenet.bind(this),
      this.compareSize.bind(this),
    ];

    for (const comparer of comparers) {
      const result = comparer(x, y);
      if (result !== 0) {
        return result;
      }
    }

    return 0;
  }

  private compareIndexerPriority(x: DownloadDecision, y: DownloadDecision): number {
    return compareByReverse(x.remoteBook.release, y.remoteBook.release, (r) => r.indexerPriority);
  }

  private compareQuality(x: DownloadDecision, y: DownloadDecision): number {
    if (this.configService.downloadPropersAndRepacks === "DoNotPrefer") {
      return compareBy(
        x.remoteBook,
        y.remoteBook,
        (remoteBook) =>
          getIndex(remoteBook.author.qualityProfile, remoteBook.parsedBookInfo.quality.quality)
            .index
      );
    }

    return compareAll(
      compareBy(
        x.remoteBook,
        y.remoteBook,
        (remoteBook) =>
          getIndex(remoteBook.author.qualityProfile, remoteBook.parsedBookInfo.quality.quality)
            .index
      ),
      // Ported from `CompareBy(..., remoteBook => remoteBook.ParsedBookInfo.Quality.Revision)`:
      // C#'s `Revision : IComparable<Revision>` compares Real first, then
      // Version (see qualities/revision.ts's compareTo) -- the whole
      // Revision object is compared here, not just `.real`.
      x.remoteBook.parsedBookInfo.quality.revision.compareTo(
        y.remoteBook.parsedBookInfo.quality.revision
      )
    );
  }

  private compareCustomFormatScore(x: DownloadDecision, y: DownloadDecision): number {
    return compareBy(x.remoteBook, y.remoteBook, (remoteBook) => remoteBook.customFormatScore);
  }

  private compareProtocol(x: DownloadDecision, y: DownloadDecision): number {
    return compareBy(x.remoteBook, y.remoteBook, (remoteBook) => {
      const delayProfile = this.delayProfileService.bestForTags(new Set(remoteBook.author.tags));
      const downloadProtocol = remoteBook.release.downloadProtocol;
      // delayProfile.preferredProtocol is typed against Profiles' own local
      // DownloadProtocol enum (a separate module, not yet reconciled to
      // import the real one from indexers/ -- see remoteBook.ts's header
      // comment on this class of Phase 2 duplication). Both represent the
      // same real NzbDrone.Core.Indexers.DownloadProtocol with identical
      // values, so comparing by number is sound; a bare === would compare
      // across nominally different enum types
      // (@typescript-eslint/no-unsafe-enum-comparison), but TS's own
      // contextual widening makes the explicit `as number` cast that
      // silences it register as "unnecessary" to
      // @typescript-eslint/no-unnecessary-type-assertion -- the two rules
      // disagree here, so this line keeps the cast and opts out of the
      // second rule rather than removing type safety to satisfy it.
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
      return downloadProtocol === (delayProfile.preferredProtocol as number) ? 1 : 0;
    });
  }

  private compareBookCount(x: DownloadDecision, y: DownloadDecision): number {
    const discographyCompare = compareBy(x.remoteBook, y.remoteBook, (remoteBook) =>
      remoteBook.parsedBookInfo.discography ? 1 : 0
    );

    if (discographyCompare !== 0) {
      return discographyCompare;
    }

    return compareByReverse(x.remoteBook, y.remoteBook, (remoteBook) => remoteBook.books.length);
  }

  private comparePeersIfTorrent(x: DownloadDecision, y: DownloadDecision): number {
    // Different protocols should get caught when checking the preferred protocol,
    // since we're dealing with the same series in our comparisions
    if (
      x.remoteBook.release.downloadProtocol !== DownloadProtocol.Torrent ||
      y.remoteBook.release.downloadProtocol !== DownloadProtocol.Torrent
    ) {
      return 0;
    }

    return compareAll(
      compareBy(x.remoteBook, y.remoteBook, (remoteBook) => {
        const seeders = getSeeders(remoteBook.release);
        return seeders != null && seeders > 0 ? Math.round(Math.log10(seeders)) : 0;
      }),
      compareBy(x.remoteBook, y.remoteBook, (remoteBook) => {
        const peers = getPeers(remoteBook.release);
        return peers != null && peers > 0 ? Math.round(Math.log10(peers)) : 0;
      })
    );
  }

  private compareAgeIfUsenet(x: DownloadDecision, y: DownloadDecision): number {
    if (
      x.remoteBook.release.downloadProtocol !== DownloadProtocol.Usenet ||
      y.remoteBook.release.downloadProtocol !== DownloadProtocol.Usenet
    ) {
      return 0;
    }

    return compareBy(x.remoteBook, y.remoteBook, (remoteBook) => {
      const release = remoteBook.release;
      const publishMs = new Date(release.publishDate).getTime();
      const ageHrs = (Date.now() - publishMs) / (60 * 60 * 1000);
      const ageDaysValue = Math.trunc((Date.now() - publishMs) / (24 * 60 * 60 * 1000));

      if (ageHrs < 1) {
        return 1000;
      }

      if (ageHrs <= 24) {
        return 100;
      }

      if (ageDaysValue <= 7) {
        return 10;
      }

      return 1;
    });
  }

  private compareSize(x: DownloadDecision, y: DownloadDecision): number {
    // TODO: Is smaller better? Smaller for usenet could mean no par2 files.
    return compareBy(x.remoteBook, y.remoteBook, (remoteBook) =>
      roundToNearest(remoteBook.release.size, 200 * 1024 * 1024)
    );
  }
}

function compareBy<TSubject, TValue extends number>(
  left: TSubject,
  right: TSubject,
  funcValue: (s: TSubject) => TValue
): number {
  const leftValue = funcValue(left);
  const rightValue = funcValue(right);

  if (leftValue < rightValue) {
    return -1;
  }
  if (leftValue > rightValue) {
    return 1;
  }
  return 0;
}

function compareByReverse<TSubject, TValue extends number>(
  left: TSubject,
  right: TSubject,
  funcValue: (s: TSubject) => TValue
): number {
  return compareBy(left, right, funcValue) * -1;
}

function compareAll(...comparers: number[]): number {
  for (const c of comparers) {
    if (c !== 0) {
      return c;
    }
  }
  return 0;
}

/** Ported from `NzbDrone.Common.Extensions.NumberExtensions.Round(long, long)`, used by CompareSize. */
function roundToNearest(value: number, nearest: number): number {
  return Math.round(value / nearest) * nearest;
}

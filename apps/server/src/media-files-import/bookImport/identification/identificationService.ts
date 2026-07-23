import { newLocalBook, type LocalBook } from "../../../parser/model/localBook.js";
import type { LocalEdition } from "../../../parser/model/localEdition.js";
import type { BookFile } from "../../bookFile.js";
import type { FileInfoLike } from "../../mediaFileDiskProvider.js";
import type { ImportDecisionMakerConfig } from "../importDecisionMakerConfig.js";
import { AugmentingFailedException } from "../aggregation/aggregationFailedException.js";
import type { IAugmentingService } from "../aggregation/aggregationService.js";
import { bookDistance, type DistanceCalculatorDeps } from "./distanceCalculator.js";
import type { CandidateEdition } from "./candidateEdition.js";
import type { ICandidateService, IdentificationOverrides } from "./candidateService.js";
import type { ITrackGroupingService } from "./trackGroupingService.js";
import { populateMatch } from "./populateMatch.js";
import { Distance } from "./distance.js";

/**
 * Forward-reference for the exact slice of `IMetadataTagService.ReadTags`
 * this service calls (`media-files-tags` sibling worktree, not merged
 * yet). Only used by `toLocalTrack`, which re-reads tags for existing
 * on-disk `BookFile`s pulled in as extra candidate context.
 */
export interface IdentificationMetadataTagReaderLike {
  readTags(file: FileInfoLike): import("../../../parser/model/parsedTrackInfo.js").ParsedTrackInfo;
}

export interface IIdentificationService {
  getLocalBookReleases(localTracks: LocalBook[], singleRelease: boolean): LocalEdition[];
  identify(
    localTracks: LocalBook[],
    idOverrides: IdentificationOverrides | null,
    config: ImportDecisionMakerConfig
  ): Promise<LocalEdition[]>;
}

/**
 * Ported from NzbDrone.Core/MediaFiles/BookImport/Identification/IdentificationService.cs.
 *
 * `Identify`/`IdentifyRelease`/`GetBestRelease` are ported as `async`
 * since `ICandidateService.GetRemoteCandidates` (this module's own,
 * already-ported `candidateService.ts`) is Promise-based -- see that
 * file's doc comment for why. `GetLocalBookReleases` stays synchronous
 * (matches its C# signature exactly; no async work in that method).
 *
 * NLog `_logger` calls (ProgressInfo/Debug/Trace/Error, stopwatch timing)
 * are omitted -- see parsingService.ts's doc comment for why this
 * codebase omits NLog throughout the port.
 */
export class IdentificationService implements IIdentificationService {
  constructor(
    private readonly trackGroupingService: ITrackGroupingService,
    private readonly metadataTagService: IdentificationMetadataTagReaderLike,
    private readonly augmentingService: IAugmentingService,
    private readonly candidateService: ICandidateService,
    private readonly distanceDeps: DistanceCalculatorDeps = {}
  ) {}

  getLocalBookReleases(localTracks: LocalBook[], singleRelease: boolean): LocalEdition[] {
    let releases: LocalEdition[];
    if (singleRelease) {
      releases = [
        {
          localBooks: localTracks,
          distance: newBookIdDistance(),
          edition: null,
          existingTracks: null,
          newDownload: false,
        },
      ];
    } else {
      releases = this.trackGroupingService.groupTracks(localTracks);
    }

    for (const localRelease of releases) {
      try {
        this.augmentingService.augmentEdition(localRelease);
      } catch (e) {
        if (!(e instanceof AugmentingFailedException)) {
          throw e;
        }
        // Augmentation failed for this release -- ported from the C#
        // source's catch-and-continue (Warn-logged, not fatal).
      }
    }

    return releases;
  }

  async identify(
    localTracks: LocalBook[],
    idOverrides: IdentificationOverrides | null,
    config: ImportDecisionMakerConfig
  ): Promise<LocalEdition[]> {
    // 1 group localTracks so that we think they represent a single release
    // 2 get candidates given specified author, book and release.  Candidates can include extra files already on disk.
    // 3 find best candidate
    const releases = this.getLocalBookReleases(localTracks, config.singleRelease);

    for (const localRelease of releases) {
      try {
        await this.identifyRelease(localRelease, idOverrides, config);
      } catch {
        // Ported from the C# source's catch-all around IdentifyRelease:
        // logged and swallowed so one bad release doesn't abort the whole
        // batch -- this is exactly the "degrade gracefully on ambiguous
        // input" discipline known-issues-fixlist.md item #3 calls for.
      }
    }

    return releases;
  }

  private toLocalTrack(trackfiles: BookFile[], localRelease: LocalEdition): LocalBook[] {
    const scannedPaths = new Set(
      trackfiles
        .filter((t) => localRelease.localBooks.some((l) => l.path === t.path))
        .map((t) => t.path)
    );
    const scanned = localRelease.localBooks.filter((l) => scannedPaths.has(l.path));
    const toScan = trackfiles.filter((t) => !scannedPaths.has(t.path));

    const localTracks: LocalBook[] = [
      ...scanned,
      ...toScan.map((x) => {
        const lb = newLocalBook();
        lb.path = x.path;
        lb.size = x.size;
        lb.modified = x.modified;
        lb.fileTrackInfo = this.metadataTagService.readTags({
          fullName: x.path,
          name: x.path,
          length: x.size,
          lastWriteTimeUtc: x.modified,
        });
        lb.existingFile = true;
        lb.additionalFile = true;
        lb.quality = x.quality;
        return lb;
      }),
    ];

    for (const x of localTracks) {
      this.augmentingService.augment(x, true);
    }

    return localTracks;
  }

  private async identifyRelease(
    localBookRelease: LocalEdition,
    idOverrides: IdentificationOverrides | null,
    config: ImportDecisionMakerConfig
  ): Promise<void> {
    let usedRemote = false;

    let candidateReleases: CandidateEdition[] = this.candidateService.getDbCandidatesFromTags(
      localBookRelease,
      idOverrides,
      config.includeExisting
    );

    // convert all the TrackFiles that represent extra files to List<LocalTrack>
    // local candidates are actually a list so this is fine to enumerate
    const allLocalTracks = this.toLocalTrack(
      distinctByPath(candidateReleases.flatMap((x) => x.existingFiles)),
      localBookRelease
    );

    if (candidateReleases.length === 0) {
      candidateReleases = [];
      for await (const candidate of this.candidateService.getRemoteCandidates(
        localBookRelease,
        idOverrides
      )) {
        if (
          config.addNewAuthors ||
          (candidate.edition.book !== undefined &&
            candidate.edition.book.id > 0 &&
            (candidate.edition.book.author?.id ?? 0) > 0)
        ) {
          candidateReleases.push(candidate);
        }
      }

      usedRemote = true;
    }

    const seenCandidate = this.getBestRelease(localBookRelease, candidateReleases, allLocalTracks);

    if (!seenCandidate) {
      // can't find any candidates even after using remote search
      // populate the overrides and return
      for (const localTrack of localBookRelease.localBooks) {
        localTrack.edition = idOverrides?.edition ?? null;
        localTrack.book = idOverrides?.book ?? null;
        localTrack.author = idOverrides?.author ?? null;
      }

      return;
    }

    // If the result isn't great and we haven't tried remote candidates, try looking for remote candidates
    // remote metadata providers may have a better edition of a local book
    if (distanceOf(localBookRelease).normalizedDistance() > 0.15 && !usedRemote) {
      const remoteCandidates: CandidateEdition[] = [];
      for await (const candidate of this.candidateService.getRemoteCandidates(
        localBookRelease,
        idOverrides
      )) {
        if (
          config.addNewAuthors ||
          (candidate.edition.book !== undefined && candidate.edition.book.id > 0)
        ) {
          remoteCandidates.push(candidate);
        }
      }

      // Ported from `GetBestRelease(..., out _)`: the C# source discards the
      // second call's `seenCandidate` out-result too (nothing reads it after
      // this point in either language).
      this.getBestRelease(localBookRelease, remoteCandidates, allLocalTracks);
    }

    populateMatch(localBookRelease, config.keepAllEditions ?? false);
  }

  private getBestRelease(
    localBookRelease: LocalEdition,
    candidateReleases: CandidateEdition[],
    extraTracksOnDisk: LocalBook[]
  ): boolean {
    let bestDistance =
      localBookRelease.edition !== null ? distanceOf(localBookRelease).normalizedDistance() : 1.0;
    let seenCandidate = false;

    for (const candidateRelease of candidateReleases) {
      seenCandidate = true;

      const release = candidateRelease.edition;

      const extraTrackPaths = new Set(candidateRelease.existingFiles.map((x) => x.path));
      const extraTracks = extraTracksOnDisk.filter((x) => extraTrackPaths.has(x.path));
      const allLocalTracks = distinctByPath([...localBookRelease.localBooks, ...extraTracks]);

      const distance = bookDistance(allLocalTracks, release, this.distanceDeps);
      const currDistance = distance.normalizedDistance();

      if (currDistance < bestDistance) {
        bestDistance = currDistance;
        localBookRelease.distance = distance;
        localBookRelease.edition = release;
        localBookRelease.existingTracks = extraTracks;
        if (currDistance === 0.0) {
          break;
        }
      }
    }

    return seenCandidate;
  }
}

function distinctByPath<T extends { path: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of items) {
    if (!seen.has(item.path)) {
      seen.add(item.path);
      result.push(item);
    }
  }
  return result;
}

/** Ported from `LocalEdition()`'s dummy distance seed (`Distance.Add("book_id", 1.0)`) -- see parser/model/localEdition.ts's doc comment for why `distance` is `unknown` there. */
function newBookIdDistance(): Distance {
  const d = new Distance();
  d.add("book_id", 1.0);
  return d;
}

function distanceOf(localEdition: LocalEdition): Distance {
  return localEdition.distance as Distance;
}

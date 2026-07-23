import type { LocalEdition } from "../../../parser/model/localEdition.js";
import { Decision } from "../../../decision-engine/decision.js";
import type {
  IImportDecisionEngineSpecification,
  DownloadClientItemLike,
} from "../importDecisionEngineSpecification.js";
import type { Distance } from "../identification/distance.js";

const BOOK_THRESHOLD = 0.2;

/**
 * Ported from NzbDrone.Core/MediaFiles/BookImport/Specifications/CloseAlbumMatchSpecification.cs.
 * C# class name is `CloseBookMatchSpecification` -- ported under the real
 * class name (see bookUpgradeSpecification.ts's doc comment for this
 * recurring file-name-vs-class-name mismatch in the upstream source).
 *
 * THIS is the specification known-issues-fixlist.md item #3 cites as the
 * mechanism that should have prevented ambiguous-match crashes/hangs:
 * rather than guessing or throwing when a match is uncertain, it rejects
 * with a specific, human-readable distance/reasons message. Ported
 * verbatim -- do not loosen or tighten the 0.20 threshold or the
 * new-download-vs-existing-file branching, per this module's task brief.
 */
export class CloseBookMatchSpecification implements IImportDecisionEngineSpecification<LocalEdition> {
  isSatisfiedBy(item: LocalEdition, _downloadClientItem: DownloadClientItemLike | null): Decision {
    const distance = item.distance as Distance;

    let dist: number;
    let reasons: string;

    // strict when a new download
    if (item.newDownload) {
      dist = distance.normalizedDistance();
      reasons = distance.reasons;
      if (dist > BOOK_THRESHOLD) {
        return Decision.reject(
          `Book match is not close enough: ${formatPercent1(1 - dist)} vs ${formatPercent0(1 - BOOK_THRESHOLD)} ${reasons}`
        );
      }
    } else {
      // otherwise importing existing files in library
      // get book distance ignoring whether tracks are missing
      dist = distance.normalizedDistanceExcluding(["missing_tracks", "unmatched_tracks"]);
      reasons = distance.reasons;
      if (dist > BOOK_THRESHOLD) {
        return Decision.reject(
          `Book match is not close enough: ${formatPercent1(1 - dist)} vs ${formatPercent0(1 - BOOK_THRESHOLD)} ${reasons}`
        );
      }
    }

    return Decision.accept();
  }
}

/** Ported from C#'s `{value:P1}` percent format specifier (one decimal place). */
function formatPercent1(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

/** Ported from C#'s `{value:P0}` percent format specifier (no decimals). */
function formatPercent0(value: number): string {
  return `${Math.round(value * 100)}%`;
}

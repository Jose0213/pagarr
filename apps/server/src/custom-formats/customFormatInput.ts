import type { Author } from "../books/models.js";
import type { IndexerFlags } from "./indexerFlags.js";

/**
 * Ported from NzbDrone.Core/Parser/Model/ParsedBookInfo.cs.
 *
 * FORWARD-REFERENCE: `ParsedBookInfo` is a Parser-module type (Parser hasn't
 * landed -- see the DecisionEngine sibling worktree, which will also need
 * it). Only the fields `CustomFormatCalculationService` and the
 * Specifications actually read are declared here (`releaseTitle`,
 * `releaseGroup`) plus the handful of others `CustomFormatCalculationService`
 * *populates* when building a `CustomFormatInput` (`quality`, `authorName`),
 * even though nothing in this module reads them back, so object literals
 * built the same way the C# source builds them type-check here without
 * fabricating unrelated fields. When the real Parser module lands, this
 * should be replaced by (or made a subset of) its full `ParsedBookInfo`.
 */
export interface ParsedBookInfo {
  authorName?: string;
  releaseTitle?: string | null;
  releaseGroup?: string | null;
  /** `QualityModel` -- ported and available at qualities/qualityModel.ts, but untyped here to avoid a hard dependency this module doesn't otherwise need. */
  quality?: unknown;
}

/**
 * Ported from NzbDrone.Core/CustomFormats/CustomFormatInput.cs.
 *
 * The commented-out constructors in the C# source (dead code, `Series`-era
 * leftovers from the Sonarr fork this was ported from) are intentionally not
 * carried over -- they were already commented out in the reference source.
 */
export interface CustomFormatInput {
  bookInfo: ParsedBookInfo | null;
  author: Author | null;
  size: number;
  indexerFlags: IndexerFlags | number;
  filename?: string;
}

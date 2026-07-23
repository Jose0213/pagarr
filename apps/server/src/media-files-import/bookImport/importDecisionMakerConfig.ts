import type { FilterFilesType } from "../filterFilesType.js";

/** Ported from NzbDrone.Core/MediaFiles/BookImport/ImportDecisionMaker.cs's `ImportDecisionMakerConfig`. */
export interface ImportDecisionMakerConfig {
  filter: FilterFilesType;
  newDownload: boolean;
  singleRelease: boolean;
  includeExisting: boolean;
  addNewAuthors: boolean;
  /**
   * Ported from `ImportDecisionMakerConfig.KeepAllEditions` (defaults to
   * `false`, the C# auto-property default, when omitted). This is the flag
   * that governs whether `LocalEdition.PopulateMatch` clones a trimmed
   * Edition/Book/Author graph (`false`, the automated-import path) or
   * keeps the full matched Edition object as-is (`true`, the manual-import
   * path) -- see populateMatch.ts's doc comment; this is the exact
   * mechanism behind known-issues-fixlist.md item #4 (manual edition
   * selection).
   */
  keepAllEditions?: boolean;
}

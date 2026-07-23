import type { Author, Book, Edition } from "../../../books/index.js";
import type { QualityModel } from "../../../qualities/qualityModel.js";
import type { ParsedTrackInfo } from "../../../parser/model/parsedTrackInfo.js";
import { Rejection } from "../importDecision.js";

/**
 * Forward-reference for `NzbDrone.Core/CustomFormats/CustomFormat.cs`.
 * `custom-formats` (this repo's module, Phase 2, merged per this
 * worktree's baseline commit) is real -- imported directly, not a
 * forward-reference; see the import below.
 */
import type { CustomFormat } from "../../../custom-formats/customFormat.js";

/** Ported from NzbDrone.Core/MediaFiles/BookImport/Manual/ManualImportItem.cs. */
export interface ManualImportItem {
  id: number;
  path: string;
  name: string;
  size: number;
  author?: Author;
  book?: Book;
  edition?: Edition;
  quality?: QualityModel;
  releaseGroup: string | null;
  downloadId: string | null;
  customFormats: CustomFormat[];
  indexerFlags: number;
  rejections: readonly Rejection[];
  tags?: ParsedTrackInfo;
  additionalFile: boolean;
  replaceExistingFiles: boolean;
  disableReleaseSwitching: boolean;
}

/** Ported from the `ManualImportItem()` constructor: CustomFormats defaults to an empty list. */
export function newManualImportItem(): ManualImportItem {
  return {
    id: 0,
    path: "",
    name: "",
    size: 0,
    releaseGroup: null,
    downloadId: null,
    customFormats: [],
    indexerFlags: 0,
    rejections: [],
    additionalFile: false,
    replaceExistingFiles: false,
    disableReleaseSwitching: false,
  };
}

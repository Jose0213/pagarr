import type { QualityModel } from "../../../qualities/qualityModel.js";
import type { Rejection } from "../../../decision-engine/rejection.js";
import type { RestResource } from "../../rest/RestResource.js";

/** Ported from Readarr.Api.V1/ManualImport/ManualImportUpdateResource.cs. */
export interface ManualImportUpdateResource extends RestResource {
  path?: string;
  name?: string;
  authorId?: number;
  bookId?: number;
  foreignEditionId?: string;
  quality?: QualityModel;
  releaseGroup?: string;
  indexerFlags?: number;
  downloadId?: string;
  additionalFile?: boolean;
  replaceExistingFiles?: boolean;
  disableReleaseSwitching?: boolean;
  rejections?: readonly Rejection[];
}

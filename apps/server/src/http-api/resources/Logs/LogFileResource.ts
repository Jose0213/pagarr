import type { RestResource } from "../../rest/RestResource.js";

/**
 * Ported from Readarr.Api.V1/Logs/LogFileResource.cs.
 *
 * Built directly by `LogFileControllerBase.GetLogFilesResponse` (there's no
 * separate `LogFileResourceMapper` in the real source -- the controller
 * constructs `LogFileResource` instances inline), so this file has no
 * `toResource`-style mapper of its own; see LogFileModuleBase.ts for where
 * these fields are actually populated.
 */
export interface LogFileResource extends RestResource {
  filename: string;
  /** ISO-8601 timestamp -- C#'s `DateTime`, ported per this codebase's established date convention. */
  lastWriteTime: string;
  contentsUrl: string;
  downloadUrl: string;
}

/**
 * Ported from NzbDrone.Core/Qualities/ProperDownloadTypes.cs.
 *
 * This enum was already ported (as a string-literal union, per this repo's
 * convention for small C# enums) in `config/enums.ts`, because
 * `ConfigService.DownloadPropersAndRepacks` references it directly and the
 * Configuration module landed in Phase 0 before Qualities. Re-exported here
 * under the Qualities module -- where the type actually lives in the C#
 * source -- so code that ports other parts of NzbDrone.Core/Qualities can
 * import it from its "real" home without a second, duplicate definition.
 */
export {
  PROPER_DOWNLOAD_TYPES_VALUES,
  type ProperDownloadTypes,
} from "../config/enums.js";

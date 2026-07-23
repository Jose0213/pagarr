/**
 * Ported from NzbDrone.Core/Validation/{DownloadClientExistsValidator,
 * MetadataProfileExistsValidator,QualityProfileExistsValidator}.cs.
 *
 * DEVIATION -- FluentValidation-to-plain-function: same mechanism deviation
 * as ruleHelpers.ts. Each C# `PropertyValidator` took its factory/service
 * dependency via constructor injection (this port's DI-container
 * replacement, per PORT_PLAN.md, is plain constructor injection / factory
 * functions passed explicitly) -- here that becomes an explicit parameter
 * on each function instead of a class field, so callers pass in whichever
 * already-ported service/factory instance they have.
 *
 * All three share the identical "0 or unset means valid (not yet selected),
 * otherwise defer to the collaborator's Exists(id) check" shape.
 */

/** Narrow shape each validator needs -- matches the real `Exists(int id)` member already present on QualityProfileService/MetadataProfileService (profiles/*.ts), and the shape DownloadClientFactory would need to add (see this module's port report -- IDownloadClientFactory has no `exists()` yet). */
export interface IdExistenceCheck {
  exists(id: number): boolean;
}

/**
 * Ported from DownloadClientExistsValidator.IsValid(): `context?.PropertyValue
 * == null || (int)context.PropertyValue == 0` short-circuits to valid
 * (nullable-safe -- the `context?.` null-conditional covers a null
 * `context` itself, not just a null value, which is unreachable in normal
 * FluentValidation usage but preserved here as "null/undefined id is valid"
 * for parity).
 */
export function isValidDownloadClientId(
  downloadClientFactory: IdExistenceCheck,
  downloadClientId: number | null | undefined
): boolean {
  if (downloadClientId === null || downloadClientId === undefined || downloadClientId === 0) {
    return true;
  }

  return downloadClientFactory.exists(downloadClientId);
}

/**
 * Ported from MetadataProfileExistsValidator.IsValid(): null OR 0 is valid
 * (two separate `if` checks in C#, same outcome as the single short-circuit
 * above).
 */
export function isValidMetadataProfileId(
  metadataProfileService: IdExistenceCheck,
  metadataProfileId: number | null | undefined
): boolean {
  if (metadataProfileId === null || metadataProfileId === undefined || metadataProfileId === 0) {
    return true;
  }

  return metadataProfileService.exists(metadataProfileId);
}

/** Ported from QualityProfileExistsValidator.IsValid(): same short-circuit shape as DownloadClientExistsValidator's. */
export function isValidQualityProfileId(
  qualityProfileService: IdExistenceCheck,
  qualityProfileId: number | null | undefined
): boolean {
  if (qualityProfileId === null || qualityProfileId === undefined || qualityProfileId === 0) {
    return true;
  }

  return qualityProfileService.exists(qualityProfileId);
}

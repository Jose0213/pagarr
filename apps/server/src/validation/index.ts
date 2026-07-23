/**
 * Barrel export for the Validation module -- port of
 * NzbDrone.Core/Validation/*.cs (26 files, including the Paths/
 * subdirectory). See PORT_PLAN.md's Phase 4 Wave 2 for how this module fits
 * into the rest of Pagarr.
 *
 * This module wraps FluentValidation in the real C# source; FluentValidation
 * itself is a generic library with no port target (see this module's port
 * report for the full DEVIATION rationale repeated in each file here) --
 * what's ported is the actual validation LOGIC each custom
 * validator/extension encapsulates, as plain predicate functions callers
 * apply directly, returning/building this port's existing
 * `ValidationResult`/`ValidationFailure` shape (indexers/IIndexerSettings.ts)
 * rather than a parallel FluentValidation-shaped result type.
 */

export * from "./validationResult.js";
export * from "./ruleHelpers.js";
export * from "./entityExistsValidators.js";
export * from "./folderChmodValidator.js";
export * from "./paths/pathValidation.js";
export * from "./paths/rootFolderValidators.js";
export * from "./paths/authorPathValidators.js";
export * from "./paths/systemFolderValidators.js";
export * from "./paths/diskValidators.js";
export * from "./paths/mappedNetworkDriveValidator.js";

/**
 * Barrel export for the Profiles module -- port of
 * NzbDrone.Core/Profiles/*.cs (QualityProfile, MetadataProfile,
 * DelayProfile, ReleaseProfile + their repositories/services). See
 * PORT_PLAN.md's Phase 1 for how this module fits into the rest of Pagarr.
 */

export type { Quality } from "../qualities/quality.js";
export * from "./customFormat.js";
export * from "./profileFormatItem.js";
export * from "./errors.js";

export * from "./qualities/qualityIndex.js";
export * from "./qualities/qualityProfileQualityItem.js";
export * from "./qualities/qualityProfile.js";
export * from "./qualities/qualityProfileRepository.js";
export * from "./qualities/qualityDefaults.js";
export * from "./qualities/qualityProfileService.js";

export * from "./metadata/metadataProfile.js";
export * from "./metadata/metadataProfileRepository.js";
export * from "./metadata/bookFiltering.js";
export {
  MetadataProfileService,
  NONE_PROFILE_NAME,
  NONE_PROFILE_MIN_POPULARITY,
  type AuthorLookup,
  type BookLookup,
  type EditionLookup,
  type MediaFileLookup,
  type MetadataProfileServiceDeps,
  type ImportListProfileUsageLookup as MetadataImportListProfileUsageLookup,
  type RootFolderProfileUsageLookup as MetadataRootFolderProfileUsageLookup,
} from "./metadata/metadataProfileService.js";

export * from "./delay/delayProfile.js";
export * from "./delay/delayProfileRepository.js";
export * from "./delay/delayProfileService.js";
export * from "./delay/delayProfileTagInUseValidator.js";

export * from "./releases/releaseProfile.js";
export * from "./releases/releaseProfileRepository.js";
export * from "./releases/releaseProfileService.js";
export * from "./releases/termMatchers.js";
export * from "./releases/perlRegexFactory.js";
export * from "./releases/termMatcherService.js";

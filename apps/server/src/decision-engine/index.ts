/**
 * Barrel export for the DecisionEngine module -- port of
 * NzbDrone.Core/DecisionEngine/*.cs (release acceptance/rejection logic).
 * See PORT_PLAN.md's Phase 2 for how this module fits into the rest of
 * Pagarr, and this module's individual files for forward-reference
 * documentation (Parser/Indexers/CustomFormats/MediaFiles/History/Queue/
 * Blocklisting/Download.Pending haven't landed yet).
 */

export * from "./decision.js";
export * from "./rejection.js";
export * from "./rejectionType.js";
export * from "./rejectWithReason.js";
export * from "./specificationPriority.js";
export * from "./downloadDecision.js";
export * from "./downloadDecisionComparer.js";
export * from "./downloadDecisionPrioritizationService.js";
export * from "./downloadDecisionMaker.js";
export * from "./createDefaultSpecifications.js";

export * from "./remoteBook.js";
export * from "./mediaFile.js";
export * from "./history.js";
export * from "./queue.js";

export * from "./specifications/decisionEngineSpecification.js";
export * from "./specifications/acceptableSizeSpecification.js";
export * from "./specifications/alreadyImportedSpecification.js";
export * from "./specifications/blockedIndexerSpecification.js";
export * from "./specifications/blocklistSpecification.js";
export * from "./specifications/customFormatAllowedByProfileSpecification.js";
export * from "./specifications/cutoffSpecification.js";
export * from "./specifications/discographySpecification.js";
export * from "./specifications/earlyReleaseSpecification.js";
export * from "./specifications/maximumSizeSpecification.js";
export * from "./specifications/minimumAgeSpecification.js";
export * from "./specifications/notSampleSpecification.js";
export * from "./specifications/protocolSpecification.js";
export * from "./specifications/qualityAllowedByProfileSpecification.js";
export * from "./specifications/queueSpecification.js";
export * from "./specifications/rawDiskSpecification.js";
export * from "./specifications/releaseRestrictionsSpecification.js";
export * from "./specifications/repackSpecification.js";
export * from "./specifications/retentionSpecification.js";
export * from "./specifications/torrentSeedingSpecification.js";
export * from "./specifications/upgradableSpecification.js";
export * from "./specifications/upgradeAllowedSpecification.js";
export * from "./specifications/upgradeDiskSpecification.js";

export * from "./specifications/rssSync/delaySpecification.js";
export * from "./specifications/rssSync/deletedBookFileSpecification.js";
export * from "./specifications/rssSync/historySpecification.js";
export * from "./specifications/rssSync/indexerTagSpecification.js";
export * from "./specifications/rssSync/monitoredBookSpecification.js";
export * from "./specifications/rssSync/properSpecification.js";

export * from "./specifications/search/authorSpecification.js";
export * from "./specifications/search/bookRequestedSpecification.js";
export * from "./specifications/search/singleBookSearchMatchSpecification.js";

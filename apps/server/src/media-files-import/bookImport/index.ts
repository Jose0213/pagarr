/**
 * Barrel export for the BookImport sub-module -- port of
 * NzbDrone.Core/MediaFiles/BookImport/*.cs. See this module's top-level
 * index.ts for how this fits into the rest of MediaFiles.
 */

export * from "./importAuthorDefaults.js";
export * from "./importDecision.js";
export * from "./importDecisionEngineSpecification.js";
export * from "./importDecisionMakerConfig.js";
export * from "./importDecisionMaker.js";
export * from "./importApprovedBooks.js";
export * from "./importResult.js";
export * from "./sceneNameCalculator.js";
export * from "./historyLike.js";

export * from "./aggregation/aggregationFailedException.js";
export * from "./aggregation/aggregationService.js";
export * from "./aggregation/aggregators/aggregateLocalTrack.js";
export * from "./aggregation/aggregators/aggregateCalibreData.js";
export * from "./aggregation/aggregators/aggregateFilenameInfo.js";
export * from "./aggregation/aggregators/aggregateQuality.js";
export * from "./aggregation/aggregators/aggregateReleaseGroup.js";

export * from "./identification/distance.js";
export * from "./identification/distanceCalculator.js";
export * from "./identification/candidateEdition.js";
export * from "./identification/candidateService.js";
export * from "./identification/enumerableExtensions.js";
export * from "./identification/identificationService.js";
export * from "./identification/identificationTestCase.js";
export * from "./identification/populateMatch.js";
export * from "./identification/trackGroupingService.js";

export * from "./manual/manualImportCommand.js";
export * from "./manual/manualImportFile.js";
export * from "./manual/manualImportItem.js";
export * from "./manual/manualImportService.js";
export * from "./manual/manuallyImportedFile.js";
export * from "./manual/trackedDownloadLike.js";

export * from "./specifications/alreadyImportedSpecification.js";
export * from "./specifications/authorPathInRootFolderSpecification.js";
export * from "./specifications/bookUpgradeSpecification.js";
export * from "./specifications/closeBookMatchSpecification.js";
export * from "./specifications/freeSpaceSpecification.js";
export * from "./specifications/notUnpackingSpecification.js";
export * from "./specifications/sameFileSpecification.js";
export * from "./specifications/upgradeSpecification.js";

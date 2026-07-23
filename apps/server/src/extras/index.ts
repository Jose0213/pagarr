/**
 * Barrel export for the Extras module -- port of
 * NzbDrone.Core/Extras/*.cs (ExistingExtraFileService, ExtraService,
 * IImportExistingExtraFiles, ImportExistingExtraFileFilterResult,
 * ImportExistingExtraFilesBase, plus the Files/, Metadata/, Others/
 * subdirectories).
 */

export * from "./extraFile.js";
export * from "./extraFileRepository.js";
export * from "./extraFileService.js";
export * from "./extraFileManager.js";
export * from "./importExistingExtraFiles.js";
export * from "./existingExtraFileService.js";
export * from "./extraService.js";
export * from "./pathHelpers.js";
export * from "./hashing.js";
export * from "./forwardRefs.js";
export * from "./createDefaultExtraFileManagers.js";
export * from "./createDefaultImporters.js";

export * from "./metadata/metadataType.js";
export * from "./metadata/metadataSectionType.js";
export * from "./metadata/imageFileResult.js";
export * from "./metadata/metadataFileResult.js";
export * from "./metadata/metadataFile.js";
export * from "./metadata/metadataFileRepository.js";
export * from "./metadata/metadataFileService.js";
export * from "./metadata/cleanMetadataFileService.js";
export * from "./metadata/metadataDefinition.js";
export * from "./metadata/metadataRepository.js";
export * from "./metadata/metadataBase.js";
export * from "./metadata/metadataFactory.js";
export * from "./metadata/metadataService.js";
export * from "./metadata/existingMetadataImporter.js";

export * from "./others/otherExtraFile.js";
export * from "./others/otherExtraFileRepository.js";
export * from "./others/otherExtraFileService.js";
export * from "./others/otherExtraFileRenamer.js";
export * from "./others/otherExtraService.js";
export * from "./others/existingOtherExtraImporter.js";

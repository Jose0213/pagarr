/**
 * Barrel export for the Download Tracking module -- port of
 * NzbDrone.Core/Download/{History,Pending,TrackedDownloads,Aggregation}/*.cs
 * plus the orchestration files directly under NzbDrone.Core/Download/*.cs,
 * and NzbDrone.Core/RemotePathMappings/*.cs (folded in per PORT_PLAN.md).
 *
 * See each file's own header comment for forward-references to the
 * sibling `download-clients` worktree (not merged yet) and other
 * not-yet-ported modules (History, MediaFiles, Queue, Messaging/Jobs).
 */

// ---- Forward-reference shape modules ----
export * from "./downloadClients.js";
export * from "./entityHistory.js";
export * from "./mediaFilesEvents.js";
export * from "./mediaFilesImport.js";
export * from "./queueItem.js";

// ---- RemotePathMappings ----
export * from "./remote-path-mappings/osPath.js";
export * from "./remote-path-mappings/remotePathMapping.js";
export * from "./remote-path-mappings/remotePathMappingRepository.js";
export * from "./remote-path-mappings/remotePathMappingService.js";

// ---- History ----
export * from "./history/downloadHistory.js";
export * from "./history/downloadHistoryRepository.js";
export * from "./history/downloadHistoryService.js";

// ---- Pending ----
export * from "./pending/pendingRelease.js";
export * from "./pending/pendingReleaseReason.js";
export * from "./pending/pendingReleaseRepository.js";
export * from "./pending/pendingReleaseService.js";
export * from "./pending/pendingReleasesUpdatedEvent.js";

// ---- TrackedDownloads ----
export * from "./tracked-downloads/debouncer.js";
export * from "./tracked-downloads/downloadMonitoringService.js";
export * from "./tracked-downloads/trackedDownload.js";
export * from "./tracked-downloads/trackedDownloadAlreadyImported.js";
export * from "./tracked-downloads/trackedDownloadRefreshedEvent.js";
export * from "./tracked-downloads/trackedDownloadService.js";
export * from "./tracked-downloads/trackedDownloadStatusMessage.js";
export * from "./tracked-downloads/trackedDownloadsRemovedEvent.js";

// ---- Aggregation ----
export * from "./aggregation/aggregateRemoteBook.js";
export * from "./aggregation/remoteBookAggregationService.js";

// ---- Orchestration ----
export * from "./bookGrabbedEvent.js";
export * from "./bookImportIncompleteEvent.js";
export * from "./commands.js";
export * from "./completedDownloadService.js";
export * from "./downloadEventHub.js";
export * from "./downloadProcessingService.js";
export * from "./downloadSeedConfigProvider.js";
export * from "./downloadService.js";
export * from "./events.js";
export * from "./failedDownloadService.js";
export * from "./ignoredDownloadService.js";
export * from "./invalidNzbException.js";
export * from "./nzbValidationService.js";
export * from "./processDownloadDecisions.js";
export * from "./processedDecisionResult.js";
export * from "./processedDecisions.js";
export * from "./provideImportItemService.js";
export * from "./redownloadFailedDownloadService.js";

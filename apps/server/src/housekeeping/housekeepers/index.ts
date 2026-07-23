import type { IDatabase } from "../../db/database.js";
import type { IManageCommandQueue } from "../../messaging/commands/commandQueueManager.js";
import type { IIndexerStatusRepository } from "../../indexers/IndexerStatusRepository.js";
import type { IDownloadClientStatusRepository } from "../../download-clients/DownloadClientStatusRepository.js";
import type { QualityProfileRepository } from "../../profiles/qualities/qualityProfileRepository.js";
import type { LogRepository } from "../../instrumentation/logRepository.js";
import type { AuthorRepository } from "../../books/authorRepository.js";
import type { IConfigService } from "../../config/configService.js";
import type { IHousekeepingDiskProvider } from "../diskProvider.js";
import {
  ImportListStatusRepositoryForCleanup,
  NotificationStatusRepositoryForCleanup,
} from "../providerStatusRepositories.js";
import type { IHousekeepingTask } from "../iHousekeepingTask.js";

import { CleanupAbsolutePathMetadataFiles } from "./cleanupAbsolutePathMetadataFiles.js";
import { CleanupAdditionalNamingSpecs } from "./cleanupAdditionalNamingSpecs.js";
import { CleanupAdditionalUsers } from "./cleanupAdditionalUsers.js";
import { CleanupCommandQueue } from "./cleanupCommandQueue.js";
import { CleanupDownloadClientUnavailablePendingReleases } from "./cleanupDownloadClientUnavailablePendingReleases.js";
import { CleanupDuplicateMetadataFiles } from "./cleanupDuplicateMetadataFiles.js";
import { CleanupOrphanedAuthorMetadata } from "./cleanupOrphanedAuthorMetadata.js";
import { CleanupOrphanedBlocklist } from "./cleanupOrphanedBlocklist.js";
import { CleanupOrphanedBookFiles } from "./cleanupOrphanedBookFiles.js";
import { CleanupOrphanedBooks } from "./cleanupOrphanedBooks.js";
import { CleanupOrphanedDownloadClientStatus } from "./cleanupOrphanedDownloadClientStatus.js";
import { CleanupOrphanedEditions } from "./cleanupOrphanedEditions.js";
import { CleanupOrphanedHistoryItems } from "./cleanupOrphanedHistoryItems.js";
import { CleanupOrphanedImportListStatus } from "./cleanupOrphanedImportListStatus.js";
import { CleanupOrphanedIndexerStatus } from "./cleanupOrphanedIndexerStatus.js";
import { CleanupOrphanedMetadataFiles } from "./cleanupOrphanedMetadataFiles.js";
import { CleanupOrphanedNotificationStatus } from "./cleanupOrphanedNotificationStatus.js";
import { CleanupOrphanedPendingReleases } from "./cleanupOrphanedPendingReleases.js";
import { CleanupOrphanedSeriesBookLinks } from "./cleanupOrphanedSeriesBookLinks.js";
import {
  CleanupQualityProfileFormatItems,
  type CustomFormatLookupForCleanup,
} from "./cleanupQualityProfileFormatItems.js";
import { CleanupTemporaryUpdateFiles } from "./cleanupTemporaryUpdateFiles.js";
import { CleanupUnusedTags } from "./cleanupUnusedTags.js";
import {
  DeleteBadMediaCovers,
  type AuthorPathsLookup,
  type MetadataFileLookup,
} from "./deleteBadMediaCovers.js";
import { FixFutureDownloadClientStatusTimes } from "./fixFutureDownloadClientStatusTimes.js";
import { FixFutureImportListStatusTimes } from "./fixFutureImportListStatusTimes.js";
import { FixFutureIndexerStatusTimes } from "./fixFutureIndexerStatusTimes.js";
import { FixFutureNotificationStatusTimes } from "./fixFutureNotificationStatusTimes.js";
import { FixFutureRunScheduledTasks } from "./fixFutureRunScheduledTasks.js";
import { FixMultipleMonitoredEditions } from "./fixMultipleMonitoredEditions.js";
import { TrimHttpCache } from "./trimHttpCache.js";
import { TrimLogDatabase } from "./trimLogDatabase.js";
import { UpdateCleanTitleForAuthor } from "./updateCleanTitleForAuthor.js";

export * from "./cleanupAbsolutePathMetadataFiles.js";
export * from "./cleanupAdditionalNamingSpecs.js";
export * from "./cleanupAdditionalUsers.js";
export * from "./cleanupCommandQueue.js";
export * from "./cleanupDownloadClientUnavailablePendingReleases.js";
export * from "./cleanupDuplicateMetadataFiles.js";
export * from "./cleanupOrphanedAuthorMetadata.js";
export * from "./cleanupOrphanedBlocklist.js";
export * from "./cleanupOrphanedBookFiles.js";
export * from "./cleanupOrphanedBooks.js";
export * from "./cleanupOrphanedDownloadClientStatus.js";
export * from "./cleanupOrphanedEditions.js";
export * from "./cleanupOrphanedHistoryItems.js";
export * from "./cleanupOrphanedImportListStatus.js";
export * from "./cleanupOrphanedIndexerStatus.js";
export * from "./cleanupOrphanedMetadataFiles.js";
export * from "./cleanupOrphanedNotificationStatus.js";
export * from "./cleanupOrphanedPendingReleases.js";
export * from "./cleanupOrphanedSeriesBookLinks.js";
export * from "./cleanupQualityProfileFormatItems.js";
export * from "./cleanupTemporaryUpdateFiles.js";
export * from "./cleanupUnusedTags.js";
export * from "./deleteBadMediaCovers.js";
export * from "./fixFutureDownloadClientStatusTimes.js";
export * from "./fixFutureImportListStatusTimes.js";
export * from "./fixFutureIndexerStatusTimes.js";
export * from "./fixFutureNotificationStatusTimes.js";
export * from "./fixFutureProviderStatusTimes.js";
export * from "./fixFutureRunScheduledTasks.js";
export * from "./fixMultipleMonitoredEditions.js";
export * from "./trimHttpCache.js";
export * from "./trimLogDatabase.js";
export * from "./updateCleanTitleForAuthor.js";

/**
 * Real dependencies `createDefaultHousekeepingTasks` needs to assemble the
 * full, real 33-task default set (mirroring what C#'s DI container would
 * resolve for `IEnumerable<IHousekeepingTask>` in the original
 * `HousekeepingService` constructor).
 */
export interface DefaultHousekeepingTaskDeps {
  mainDatabase: IDatabase;
  cacheDatabase: IDatabase;
  commandQueueManager: IManageCommandQueue;
  indexerStatusRepository: IIndexerStatusRepository;
  downloadClientStatusRepository: IDownloadClientStatusRepository;
  qualityProfileRepository: QualityProfileRepository;
  customFormatRepository: CustomFormatLookupForCleanup;
  logRepository: Pick<LogRepository, "trim">;
  authorRepository: Pick<AuthorRepository, "allWithMetadata" | "update">;
  metadataFileService: MetadataFileLookup;
  authorService: AuthorPathsLookup;
  configService: IConfigService;
  diskProvider: IHousekeepingDiskProvider;
  /** Stand-in for NLog `Logger.Debug`/`Logger.Error` calls -- see individual task doc comments for this port's established no-NLog-yet convention. */
  onDebugLog?: (message: string) => void;
  onError?: (path: string, error: unknown) => void;
  /** `BuildInfo.IsDebug` stand-in -- see fixFutureRunScheduledTasks.ts's doc comment. */
  isDebugBuild?: boolean;
}

/**
 * Builds the real, complete default housekeeping task list -- one instance
 * of every one of the 33 `Housekeepers/*.cs` classes, in the same order as
 * the real source tree's directory listing (alphabetical by filename,
 * matching how C#'s assembly-scanning DI registration would enumerate
 * them). `HousekeepingService`'s own `Clean()` loop runs tasks in whatever
 * order its injected `IEnumerable<IHousekeepingTask>` iterates -- this
 * order is not behaviorally significant (each task is independent), but is
 * kept alphabetical for readability/diffability against the source tree.
 *
 * `ImportListStatusRepositoryForCleanup`/`NotificationStatusRepositoryForCleanup`
 * (../providerStatusRepositories.ts) are constructed here directly from
 * `mainDatabase` rather than taking them as caller-supplied deps -- unlike
 * every other dependency in this list (which come from real, already-ported
 * modules a caller is expected to already have instances of), these two are
 * this module's own internal forward-ref stand-ins with no existing owner
 * elsewhere to inject from.
 */
export function createDefaultHousekeepingTasks(
  deps: DefaultHousekeepingTaskDeps
): IHousekeepingTask[] {
  return [
    new CleanupAbsolutePathMetadataFiles(deps.mainDatabase),
    new CleanupAdditionalNamingSpecs(deps.mainDatabase),
    new CleanupAdditionalUsers(deps.mainDatabase),
    new CleanupCommandQueue(deps.commandQueueManager),
    new CleanupDownloadClientUnavailablePendingReleases(deps.mainDatabase),
    new CleanupDuplicateMetadataFiles(deps.mainDatabase),
    new CleanupOrphanedAuthorMetadata(deps.mainDatabase),
    new CleanupOrphanedBlocklist(deps.mainDatabase),
    new CleanupOrphanedBookFiles(deps.mainDatabase),
    new CleanupOrphanedBooks(deps.mainDatabase),
    new CleanupOrphanedDownloadClientStatus(deps.mainDatabase),
    new CleanupOrphanedEditions(deps.mainDatabase),
    new CleanupOrphanedHistoryItems(deps.mainDatabase),
    new CleanupOrphanedImportListStatus(deps.mainDatabase),
    new CleanupOrphanedIndexerStatus(deps.mainDatabase),
    new CleanupOrphanedMetadataFiles(deps.mainDatabase),
    new CleanupOrphanedNotificationStatus(deps.mainDatabase),
    new CleanupOrphanedPendingReleases(deps.mainDatabase),
    new CleanupOrphanedSeriesBookLinks(deps.mainDatabase),
    new CleanupQualityProfileFormatItems(
      deps.qualityProfileRepository,
      deps.customFormatRepository
    ),
    new CleanupTemporaryUpdateFiles(deps.diskProvider),
    new CleanupUnusedTags(deps.mainDatabase),
    new DeleteBadMediaCovers(
      deps.metadataFileService,
      deps.authorService,
      deps.diskProvider,
      deps.configService,
      deps.onError
    ),
    new FixFutureDownloadClientStatusTimes(deps.downloadClientStatusRepository),
    new FixFutureImportListStatusTimes(new ImportListStatusRepositoryForCleanup(deps.mainDatabase)),
    new FixFutureIndexerStatusTimes(deps.indexerStatusRepository),
    new FixFutureNotificationStatusTimes(
      new NotificationStatusRepositoryForCleanup(deps.mainDatabase)
    ),
    new FixFutureRunScheduledTasks(deps.mainDatabase, deps.isDebugBuild ?? false, deps.onDebugLog),
    new FixMultipleMonitoredEditions(deps.mainDatabase),
    new TrimHttpCache(deps.cacheDatabase),
    new TrimLogDatabase(deps.logRepository),
    new UpdateCleanTitleForAuthor(deps.authorRepository),
  ];
}

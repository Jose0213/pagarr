import type { IConfigService } from "../config/configService.js";
import type { DelayProfileService } from "../profiles/delay/delayProfileService.js";
import type { ReleaseProfileService } from "../profiles/releases/releaseProfileService.js";
import type { TermMatcherService } from "../profiles/releases/termMatcherService.js";
import type { BlocklistServiceLike } from "./specifications/blocklistSpecification.js";
import type { IndexerStatusServiceLike } from "./specifications/blockedIndexerSpecification.js";
import type { DiskProviderLike } from "./specifications/rssSync/deletedBookFileSpecification.js";
import type { PendingReleaseServiceLike } from "./specifications/rssSync/delaySpecification.js";
import type { HistoryServiceLike } from "./history.js";
import type { CustomFormatCalculationServiceLike, MediaFileServiceLike } from "./mediaFile.js";
import type { QueueServiceLike } from "./queue.js";
import type { IndexerFactoryLike } from "./remoteBook.js";
import type { IDecisionEngineSpecification } from "./specifications/decisionEngineSpecification.js";

import { AcceptableSizeSpecification } from "./specifications/acceptableSizeSpecification.js";
import { AlreadyImportedSpecification } from "./specifications/alreadyImportedSpecification.js";
import { BlockedIndexerSpecification } from "./specifications/blockedIndexerSpecification.js";
import { BlocklistSpecification } from "./specifications/blocklistSpecification.js";
import { CustomFormatAllowedByProfileSpecification } from "./specifications/customFormatAllowedByProfileSpecification.js";
import { CutoffSpecification } from "./specifications/cutoffSpecification.js";
import { DiscographySpecification } from "./specifications/discographySpecification.js";
import { EarlyReleaseSpecification } from "./specifications/earlyReleaseSpecification.js";
import { MaximumSizeSpecification } from "./specifications/maximumSizeSpecification.js";
import { MinimumAgeSpecification } from "./specifications/minimumAgeSpecification.js";
import { NotSampleSpecification } from "./specifications/notSampleSpecification.js";
import { ProtocolSpecification } from "./specifications/protocolSpecification.js";
import { QualityAllowedByProfileSpecification } from "./specifications/qualityAllowedByProfileSpecification.js";
import { QueueSpecification } from "./specifications/queueSpecification.js";
import { RawDiskSpecification } from "./specifications/rawDiskSpecification.js";
import { ReleaseRestrictionsSpecification } from "./specifications/releaseRestrictionsSpecification.js";
import { RepackSpecification } from "./specifications/repackSpecification.js";
import { RetentionSpecification } from "./specifications/retentionSpecification.js";
import { TorrentSeedingSpecification } from "./specifications/torrentSeedingSpecification.js";
import { UpgradableSpecification } from "./specifications/upgradableSpecification.js";
import { UpgradeAllowedSpecification } from "./specifications/upgradeAllowedSpecification.js";
import { UpgradeDiskSpecification } from "./specifications/upgradeDiskSpecification.js";

import { DelaySpecification } from "./specifications/rssSync/delaySpecification.js";
import { DeletedBookFileSpecification } from "./specifications/rssSync/deletedBookFileSpecification.js";
import { HistorySpecification } from "./specifications/rssSync/historySpecification.js";
import { IndexerTagSpecification } from "./specifications/rssSync/indexerTagSpecification.js";
import { MonitoredBookSpecification } from "./specifications/rssSync/monitoredBookSpecification.js";
import { ProperSpecification } from "./specifications/rssSync/properSpecification.js";

import { AuthorSpecification } from "./specifications/search/authorSpecification.js";
import { BookRequestedSpecification } from "./specifications/search/bookRequestedSpecification.js";
import { SingleBookSearchMatchSpecification } from "./specifications/search/singleBookSearchMatchSpecification.js";

/**
 * The full dependency bag every real `IDecisionEngineSpecification`
 * implementation needs, collected in one place. Each field corresponds to a
 * C# service interface DecisionEngine's Specifications/ classes take via
 * constructor injection (`IConfigService`, `IDelayProfileService`,
 * `IMediaFileService`, `IHistoryService`, `IQueueService`,
 * `IBlocklistService`, `IIndexerFactory`, `IDiskProvider`,
 * `IPendingReleaseService`, `ICustomFormatCalculationService`, plus the two
 * already-ported Profiles services `ReleaseProfileService`/
 * `TermMatcherService`). Everything not yet ported (History, Queue,
 * Blocklisting, Indexers, MediaFiles, Download.Pending, CustomFormats, Disk)
 * is typed against this module's local forward-ref interfaces -- see each
 * spec file's own header comment and remoteBook.ts/mediaFile.ts/history.ts/
 * queue.ts for the forward-ref catalogue.
 */
export interface DecisionEngineDependencies {
  configService: IConfigService;
  delayProfileService: DelayProfileService;
  releaseProfileService: ReleaseProfileService;
  termMatcherService: TermMatcherService;
  mediaFileService: MediaFileServiceLike;
  historyService: HistoryServiceLike;
  queueService: QueueServiceLike;
  blocklistService: BlocklistServiceLike;
  indexerFactory: IndexerFactoryLike;
  indexerStatusService: IndexerStatusServiceLike;
  diskProvider: DiskProviderLike;
  pendingReleaseService: PendingReleaseServiceLike;
  formatService: CustomFormatCalculationServiceLike;
}

/**
 * Ported from the *intent* of C#'s DI-container reflection scan over
 * `IDecisionEngineSpecification` implementations (see
 * `downloadDecisionMaker.ts`'s header comment for the "explicit over
 * reflection" rationale, matching this project's established Datastore
 * module pattern) -- builds the explicit array `DownloadDecisionMaker`
 * needs. Order doesn't matter for correctness: specs are grouped and
 * short-circuited by `.priority` at evaluation time, not by array position
 * (see `DownloadDecisionMaker.getDecisionForReport`). Listed here in the
 * same order the real C# `Specifications/` directory lists the root-level
 * files, then RssSync/, then Search/, for easy side-by-side comparison with
 * the source tree.
 *
 * `UpgradableSpecification` itself is also a dependency of several other
 * specs (Cutoff, Queue, Repack, UpgradeAllowed, UpgradeDisk, RssSync/
 * Delay, RssSync/Proper) in the real C# source too -- it's constructed once
 * here and threaded through, exactly like the C# DI container would inject
 * the same singleton instance everywhere it's requested.
 */
export function createDefaultSpecifications(
  deps: DecisionEngineDependencies
): IDecisionEngineSpecification[] {
  const upgradableSpecification = new UpgradableSpecification(deps.configService);

  return [
    new AcceptableSizeSpecification(),
    new AlreadyImportedSpecification(
      deps.historyService,
      deps.configService,
      deps.mediaFileService
    ),
    new BlockedIndexerSpecification(deps.indexerStatusService),
    new BlocklistSpecification(deps.blocklistService),
    new CustomFormatAllowedByProfileSpecification(),
    new CutoffSpecification(upgradableSpecification, deps.formatService, deps.mediaFileService),
    new DiscographySpecification(),
    new EarlyReleaseSpecification(deps.indexerFactory),
    new MaximumSizeSpecification(deps.configService),
    new MinimumAgeSpecification(deps.configService),
    new NotSampleSpecification(),
    new ProtocolSpecification(deps.delayProfileService),
    new QualityAllowedByProfileSpecification(),
    new QueueSpecification(
      deps.queueService,
      upgradableSpecification,
      deps.formatService,
      deps.configService
    ),
    new RawDiskSpecification(),
    new ReleaseRestrictionsSpecification(deps.termMatcherService, deps.releaseProfileService),
    new RepackSpecification(deps.mediaFileService, upgradableSpecification, deps.configService),
    new RetentionSpecification(deps.configService),
    new TorrentSeedingSpecification(deps.indexerFactory),
    new UpgradeAllowedSpecification(
      upgradableSpecification,
      deps.formatService,
      deps.mediaFileService
    ),
    new UpgradeDiskSpecification(
      upgradableSpecification,
      deps.formatService,
      deps.mediaFileService
    ),

    new DelaySpecification(
      deps.pendingReleaseService,
      upgradableSpecification,
      deps.delayProfileService,
      deps.mediaFileService
    ),
    new DeletedBookFileSpecification(deps.diskProvider, deps.configService, deps.mediaFileService),
    new HistorySpecification(
      deps.historyService,
      upgradableSpecification,
      deps.formatService,
      deps.configService
    ),
    new IndexerTagSpecification(deps.indexerFactory),
    new MonitoredBookSpecification(),
    new ProperSpecification(upgradableSpecification, deps.configService, deps.mediaFileService),

    new AuthorSpecification(),
    new BookRequestedSpecification(),
    new SingleBookSearchMatchSpecification(),
  ];
}

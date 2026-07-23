import { TrackImportedEvent, TrackImportFailedEvent } from "../../media-files-import/events.js";
import { checkOn, CheckOnCondition, type CheckOnEntry } from "../checkOnAttribute.js";
import {
  createHealthCheck,
  createOkHealthCheck,
  HealthCheckResult,
  type HealthCheck,
} from "../healthCheck.js";
import { HealthCheckBase } from "../healthCheckBase.js";
import type { ILocalizationService } from "../localizationService.js";
import { BookImportedEvent } from "./bookImportedEvent.js";
import { formatMessage } from "./_shared.js";

/**
 * Ported from NzbDrone.Core/HealthCheck/Checks/RecyclingBinCheck.cs. See
 * `importListRootFolderCheck.ts`'s doc comment re: `BookImportedEvent`
 * being real-but-unported (`./bookImportedEvent.ts`).
 */
export const CHECK_ON: CheckOnEntry[] = [
  checkOn(BookImportedEvent, CheckOnCondition.FailedOnly),
  checkOn(TrackImportedEvent, CheckOnCondition.FailedOnly),
  checkOn(TrackImportFailedEvent, CheckOnCondition.SuccessfulOnly),
];

/** Minimal config surface this check needs -- matches `config/configService.ts`'s `IConfigService.recycleBin`. */
export interface RecyclingBinCheckConfig {
  readonly recycleBin: string;
}

export interface RecyclingBinCheckDiskProvider {
  folderWritable(path: string): Promise<boolean> | boolean;
}

export class RecyclingBinCheck extends HealthCheckBase {
  constructor(
    private readonly configService: RecyclingBinCheckConfig,
    private readonly diskProvider: RecyclingBinCheckDiskProvider,
    localizationService: ILocalizationService
  ) {
    super(localizationService);
  }

  async check(): Promise<HealthCheck> {
    const recycleBin = this.configService.recycleBin;

    if (!recycleBin || !recycleBin.trim()) {
      return createOkHealthCheck(RecyclingBinCheck);
    }

    if (!(await this.diskProvider.folderWritable(recycleBin))) {
      return createHealthCheck(
        RecyclingBinCheck,
        HealthCheckResult.Error,
        formatMessage(
          this.localizationService.getLocalizedString("RecycleBinUnableToWriteHealthCheck"),
          recycleBin
        ),
        "#cannot-write-recycle-bin"
      );
    }

    return createOkHealthCheck(RecyclingBinCheck);
  }
}

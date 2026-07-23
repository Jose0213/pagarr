import type { IProvideDownloadClient } from "../../download-clients/DownloadClientProvider.js";
import { DownloadClientException } from "../../download-clients/DownloadClientException.js";
import { checkOn, CheckOnCondition, type CheckOnEntry } from "../checkOnAttribute.js";
import { ProviderUpdatedEvent } from "../../thingi-provider/events/ProviderUpdatedEvent.js";
import { ProviderDeletedEvent } from "../../thingi-provider/events/ProviderDeletedEvent.js";
import {
  createHealthCheck,
  createOkHealthCheck,
  HealthCheckResult,
  type HealthCheck,
} from "../healthCheck.js";
import { HealthCheckBase } from "../healthCheckBase.js";
import type { ILocalizationService } from "../localizationService.js";
import { formatMessage } from "./_shared.js";

/**
 * Ported from NzbDrone.Core/HealthCheck/Checks/DownloadClientRemovesCompletedDownloadsCheck.cs.
 *
 * `[CheckOn(typeof(ModelEvent<RootFolder>))]`/`[CheckOn(typeof(ModelEvent<
 * RemotePathMapping>))]` NOT reproduced -- see `calibreRootFolderCheck.ts`'s
 * doc comment for why `ModelEvent<T>` reified-generic dispatch has no
 * faithful TS/JS runtime equivalent. `ProviderUpdatedEvent<IDownloadClient>`/
 * `ProviderDeletedEvent` ARE reproduced -- see `downloadClientCheck.ts`'s
 * doc comment for why those DO subscribe faithfully (genuinely one
 * constructor per event kind, not per provider kind, at the TS runtime
 * level).
 */
export const CHECK_ON: CheckOnEntry[] = [
  checkOn(ProviderUpdatedEvent, CheckOnCondition.Always),
  checkOn(ProviderDeletedEvent, CheckOnCondition.Always),
];

/** Minimal logger surface this check needs. */
export interface DownloadClientRemovesCompletedDownloadsCheckLogger {
  debug(errorOrMessage: unknown, message?: string, ...args: unknown[]): void;
  error(errorOrMessage: unknown, message?: string, ...args: unknown[]): void;
}

const noopLogger: DownloadClientRemovesCompletedDownloadsCheckLogger = {
  debug: () => {},
  error: () => {},
};

export class DownloadClientRemovesCompletedDownloadsCheck extends HealthCheckBase {
  constructor(
    private readonly downloadClientProvider: IProvideDownloadClient,
    localizationService: ILocalizationService,
    private readonly logger: DownloadClientRemovesCompletedDownloadsCheckLogger = noopLogger
  ) {
    super(localizationService);
  }

  async check(): Promise<HealthCheck> {
    const clients = this.downloadClientProvider.getDownloadClients(true);

    for (const client of clients) {
      try {
        const clientName = client.definition.name;
        const status = await client.getStatus();

        if (status.removesCompletedDownloads) {
          return createHealthCheck(
            DownloadClientRemovesCompletedDownloadsCheck,
            HealthCheckResult.Warning,
            formatMessage(
              this.localizationService.getLocalizedString(
                "DownloadClientRemovesCompletedDownloadsHealthCheckMessage"
              ),
              clientName,
              "Readarr"
            ),
            "#download-client-removes-completed-downloads"
          );
        }
      } catch (ex) {
        if (ex instanceof DownloadClientException) {
          this.logger.debug(ex, "Unable to communicate with {0}", client.definition.name);
        } else {
          this.logger.error(
            ex,
            "Unknown error occurred in DownloadClientHistoryRetentionCheck HealthCheck"
          );
        }
      }
    }

    return createOkHealthCheck(DownloadClientRemovesCompletedDownloadsCheck);
  }
}

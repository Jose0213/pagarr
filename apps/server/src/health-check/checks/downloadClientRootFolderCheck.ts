import type { IProvideDownloadClient } from "../../download-clients/DownloadClientProvider.js";
import { DownloadClientException } from "../../download-clients/DownloadClientException.js";
import { HttpException } from "../../http/index.js";
import type { RootFolder } from "../../root-folders/root-folder.js";
import { pathEquals } from "../../root-folders/path-utils.js";
import { checkOn, CheckOnCondition, type CheckOnEntry } from "../checkOnAttribute.js";
import { ProviderAddedEvent } from "../../thingi-provider/events/ProviderAddedEvent.js";
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
 * Ported from NzbDrone.Core/HealthCheck/Checks/DownloadClientRootFolderCheck.cs.
 *
 * `[CheckOn(typeof(ModelEvent<RootFolder>))]`/`[CheckOn(typeof(ModelEvent<
 * RemotePathMapping>))]` NOT reproduced -- see `calibreRootFolderCheck.ts`'s
 * doc comment. `ProviderAddedEvent<IDownloadClient>`/`ProviderUpdatedEvent`/
 * `ProviderDeletedEvent` ARE reproduced -- see `downloadClientCheck.ts`'s
 * doc comment.
 */
export const CHECK_ON: CheckOnEntry[] = [
  checkOn(ProviderAddedEvent, CheckOnCondition.Always),
  checkOn(ProviderUpdatedEvent, CheckOnCondition.Always),
  checkOn(ProviderDeletedEvent, CheckOnCondition.Always),
];

export interface DownloadClientRootFolderCheckRootFolderService {
  all(): RootFolder[];
}

/** Minimal logger surface this check needs. */
export interface DownloadClientRootFolderCheckLogger {
  debug(errorOrMessage: unknown, message?: string, ...args: unknown[]): void;
  error(errorOrMessage: unknown, message?: string, ...args: unknown[]): void;
}

const noopLogger: DownloadClientRootFolderCheckLogger = { debug: () => {}, error: () => {} };

export class DownloadClientRootFolderCheck extends HealthCheckBase {
  constructor(
    private readonly downloadClientProvider: IProvideDownloadClient,
    private readonly rootFolderService: DownloadClientRootFolderCheckRootFolderService,
    localizationService: ILocalizationService,
    private readonly logger: DownloadClientRootFolderCheckLogger = noopLogger
  ) {
    super(localizationService);
  }

  async check(): Promise<HealthCheck> {
    // Only check clients not in failure status, those get another message
    const clients = this.downloadClientProvider.getDownloadClients(true);

    const rootFolders = this.rootFolderService.all();

    for (const client of clients) {
      try {
        const status = await client.getStatus();
        const folders = status.outputRootFolders;
        for (const folder of folders) {
          if (rootFolders.some((r) => pathEquals(r.path, folder.fullPath))) {
            return createHealthCheck(
              DownloadClientRootFolderCheck,
              HealthCheckResult.Warning,
              formatMessage(
                this.localizationService.getLocalizedString("DownloadClientCheckDownloadingToRoot"),
                client.definition.name,
                folder.fullPath
              ),
              "#downloads-in-root-folder"
            );
          }
        }
      } catch (ex) {
        if (ex instanceof DownloadClientException || ex instanceof HttpException) {
          // Ported from the C# source's two debug-only catch blocks
          // (`DownloadClientException`, `HttpRequestException`) -- this
          // port's HttpClient wrapper (http/HttpException.ts) throws its
          // own `HttpException` rather than a raw `HttpRequestException`,
          // the direct analog for that second clause.
          this.logger.debug(ex, "Unable to communicate with {0}", client.definition.name);
        } else {
          this.logger.error(
            ex,
            "Unknown error occured in DownloadClientRootFolderCheck HealthCheck"
          );
        }
      }
    }

    return createOkHealthCheck(DownloadClientRootFolderCheck);
  }
}

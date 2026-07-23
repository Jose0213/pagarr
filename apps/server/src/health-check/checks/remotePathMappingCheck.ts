import type { IProvideDownloadClient } from "../../download-clients/DownloadClientProvider.js";
import { DownloadClientException } from "../../download-clients/DownloadClientException.js";
import { HttpException } from "../../http/index.js";
import { OsPath } from "../../download-clients/OsPath.js";
import { TrackImportedEvent, TrackImportFailedEvent } from "../../media-files-import/events.js";
import { ProviderAddedEvent } from "../../thingi-provider/events/ProviderAddedEvent.js";
import { ProviderUpdatedEvent } from "../../thingi-provider/events/ProviderUpdatedEvent.js";
import { ProviderDeletedEvent } from "../../thingi-provider/events/ProviderDeletedEvent.js";
import { checkOn, CheckOnCondition, type CheckOnEntry } from "../checkOnAttribute.js";
import {
  createHealthCheck,
  createOkHealthCheck,
  HealthCheckResult,
  type HealthCheck,
} from "../healthCheck.js";
import { HealthCheckBase } from "../healthCheckBase.js";
import type { IProvideHealthCheckWithMessage } from "../iProvideHealthCheck.js";
import type { ILocalizationService } from "../localizationService.js";
import type { IEvent } from "../../messaging/index.js";
import { formatMessage } from "./_shared.js";

/**
 * Ported from NzbDrone.Core/HealthCheck/Checks/RemotePathMappingCheck.cs.
 *
 * `[CheckOn(typeof(ModelEvent<RemotePathMapping>))]` NOT reproduced -- see
 * `calibreRootFolderCheck.ts`'s doc comment (`ModelEvent<T>` reified-generic
 * dispatch has no faithful TS runtime equivalent). The other four attributes
 * ARE reproduced, matching `downloadClientCheck.ts`'s precedent for
 * `ProviderAddedEvent`/`ProviderUpdatedEvent`/`ProviderDeletedEvent`.
 *
 * `PathValidationType.CurrentOs` (a `.IsPathValid` extension check) is
 * ported via `OsPath.isRooted`, the same substitute
 * `calibreRootFolderCheck.ts` uses for the same real C# concept ("is this a
 * syntactically valid path for the OS Pagarr is running on").
 *
 * `TrackImportFailedEvent.DownloadClientInfo`/`.DownloadId` (real C# fields,
 * see `TrackImportFailedEvent.cs`) are not carried as separate fields on
 * this port's `media-files-import/events.ts` `TrackImportFailedEvent<
 * TLocalBook, TDownloadClientItem>` -- that class only stores the whole
 * `downloadClientItem` (see that file's doc comment: constructor takes
 * `downloadClientItem` directly rather than deriving `DownloadClientInfo`/
 * `DownloadId` the way the C# ctor's `if (downloadClientItem != null)`
 * branch does). This check derives `.name`/`.downloadId` from
 * `message.downloadClientItem` itself (typed as `DownloadClientItemLike`
 * below) rather than from separate fields that don't exist on the ported
 * event class -- behaviorally identical, since the real C# ctor derived
 * those same two fields FROM `downloadClientItem` in the first place.
 */
export const CHECK_ON: CheckOnEntry[] = [
  checkOn(ProviderAddedEvent, CheckOnCondition.Always),
  checkOn(ProviderUpdatedEvent, CheckOnCondition.Always),
  checkOn(ProviderDeletedEvent, CheckOnCondition.Always),
  checkOn(TrackImportedEvent, CheckOnCondition.FailedOnly),
  checkOn(TrackImportFailedEvent, CheckOnCondition.SuccessfulOnly),
];

/** Minimal `LocalBook`-shaped surface this check needs from `TrackImportFailedEvent.trackInfo`. */
export interface LocalBookLike {
  path: string;
}

/** Minimal `DownloadClientItem`-shaped surface this check needs from `TrackImportFailedEvent.downloadClientItem`. */
export interface DownloadClientItemLike {
  downloadId: string;
  downloadClientInfo: { name: string } | null;
  outputPath: { fullPath: string } | null;
}

export interface OsInfoLike {
  readonly name: string;
  readonly isDocker: boolean;
}

export interface RemotePathMappingCheckDiskProvider {
  folderExists(path: string): boolean;
  fileExists(path: string): boolean;
}

/** Minimal config surface this check needs. */
export interface RemotePathMappingCheckConfig {
  readonly enableCompletedDownloadHandling: boolean;
}

/** Minimal logger surface this check needs. */
export interface RemotePathMappingCheckLogger {
  debug(errorOrMessage: unknown, message?: string, ...args: unknown[]): void;
  error(errorOrMessage: unknown, message?: string, ...args: unknown[]): void;
}

const noopLogger: RemotePathMappingCheckLogger = { debug: () => {}, error: () => {} };

export class RemotePathMappingCheck
  extends HealthCheckBase
  implements IProvideHealthCheckWithMessage
{
  constructor(
    private readonly diskProvider: RemotePathMappingCheckDiskProvider,
    private readonly downloadClientProvider: IProvideDownloadClient,
    private readonly configService: RemotePathMappingCheckConfig,
    private readonly osInfo: OsInfoLike,
    localizationService: ILocalizationService,
    private readonly logger: RemotePathMappingCheckLogger = noopLogger
  ) {
    super(localizationService);
  }

  async check(): Promise<HealthCheck> {
    // We don't care about client folders if we are not handling completed files
    if (!this.configService.enableCompletedDownloadHandling) {
      return createOkHealthCheck(RemotePathMappingCheck);
    }

    // Only check clients not in failure status, those get another message
    const clients = this.downloadClientProvider.getDownloadClients(true);

    for (const client of clients) {
      try {
        const status = await client.getStatus();
        const folders = status.outputRootFolders;
        for (const folder of folders) {
          if (!new OsPath(folder.fullPath).isRooted) {
            if (!status.isLocalhost) {
              return createHealthCheck(
                RemotePathMappingCheck,
                HealthCheckResult.Error,
                formatMessage(
                  this.localizationService.getLocalizedString("RemotePathMappingCheckWrongOSPath"),
                  client.definition.name,
                  folder.fullPath,
                  this.osInfo.name
                ),
                "#bad-remote-path-mapping"
              );
            } else if (this.osInfo.isDocker) {
              return createHealthCheck(
                RemotePathMappingCheck,
                HealthCheckResult.Error,
                formatMessage(
                  this.localizationService.getLocalizedString(
                    "RemotePathMappingCheckBadDockerPath"
                  ),
                  client.definition.name,
                  folder.fullPath,
                  this.osInfo.name
                ),
                "#docker-bad-remote-path-mapping"
              );
            } else {
              return createHealthCheck(
                RemotePathMappingCheck,
                HealthCheckResult.Error,
                formatMessage(
                  this.localizationService.getLocalizedString(
                    "RemotePathMappingCheckLocalWrongOSPath"
                  ),
                  client.definition.name,
                  folder.fullPath,
                  this.osInfo.name
                ),
                "#bad-download-client-settings"
              );
            }
          }

          if (!this.diskProvider.folderExists(folder.fullPath)) {
            if (this.osInfo.isDocker) {
              return createHealthCheck(
                RemotePathMappingCheck,
                HealthCheckResult.Error,
                formatMessage(
                  this.localizationService.getLocalizedString(
                    "RemotePathMappingCheckDockerFolderMissing"
                  ),
                  client.definition.name,
                  folder.fullPath
                ),
                "#docker-bad-remote-path-mapping"
              );
            } else if (!status.isLocalhost) {
              return createHealthCheck(
                RemotePathMappingCheck,
                HealthCheckResult.Error,
                formatMessage(
                  this.localizationService.getLocalizedString(
                    "RemotePathMappingCheckLocalFolderMissing"
                  ),
                  client.definition.name,
                  folder.fullPath
                ),
                "#bad-remote-path-mapping"
              );
            } else {
              return createHealthCheck(
                RemotePathMappingCheck,
                HealthCheckResult.Error,
                formatMessage(
                  this.localizationService.getLocalizedString(
                    "RemotePathMappingCheckGenericPermissions"
                  ),
                  client.definition.name,
                  folder.fullPath
                ),
                "#permissions-error"
              );
            }
          }
        }
      } catch (ex) {
        if (ex instanceof DownloadClientException || ex instanceof HttpException) {
          this.logger.debug(ex, "Unable to communicate with {0}", client.definition.name);
        } else {
          this.logger.error(ex, "Unknown error occured in RemotePathMapping HealthCheck");
        }
      }
    }

    return createOkHealthCheck(RemotePathMappingCheck);
  }

  async checkWithMessage(message: IEvent): Promise<HealthCheck> {
    // We don't care about client folders if we are not handling completed files
    if (!this.configService.enableCompletedDownloadHandling) {
      return createOkHealthCheck(RemotePathMappingCheck);
    }

    if (message instanceof TrackImportFailedEvent) {
      const failureMessage = message as TrackImportFailedEvent<
        LocalBookLike,
        DownloadClientItemLike
      >;

      // if we can see the file exists but the import failed then likely a permissions issue
      if (failureMessage.trackInfo !== null) {
        const trackPath = failureMessage.trackInfo.path;
        if (this.diskProvider.fileExists(trackPath)) {
          return createHealthCheck(
            RemotePathMappingCheck,
            HealthCheckResult.Error,
            formatMessage(
              this.localizationService.getLocalizedString(
                "RemotePathMappingCheckDownloadPermissions"
              ),
              trackPath
            ),
            "#permissions-error"
          );
        } else {
          // If the file doesn't exist but TrackInfo is not null then the message is coming from
          // ImportApprovedTracks and the file must have been removed part way through processing
          return createHealthCheck(
            RemotePathMappingCheck,
            HealthCheckResult.Error,
            formatMessage(
              this.localizationService.getLocalizedString("RemotePathMappingCheckFileRemoved"),
              trackPath
            ),
            "#remote-path-file-removed"
          );
        }
      }

      // If the previous case did not match then the failure occured in DownloadedTracksImportService,
      // while trying to locate the files reported by the download client
      // Only check clients not in failure status, those get another message
      const clientName = failureMessage.downloadClientItem?.downloadClientInfo?.name;
      const client = this.downloadClientProvider
        .getDownloadClients(true)
        .find((x) => x.definition.name === clientName);

      if (!client) {
        return createOkHealthCheck(RemotePathMappingCheck);
      }

      try {
        const status = await client.getStatus();
        const items = await client.getItems();
        const dlpath = items.find(
          (x) => x.downloadId === failureMessage.downloadClientItem?.downloadId
        )?.outputPath.fullPath;

        // If dlpath is null then there's not much useful we can report.  Give a generic message so
        // that the user realises something is wrong.
        if (!dlpath || !dlpath.trim()) {
          return createHealthCheck(
            RemotePathMappingCheck,
            HealthCheckResult.Error,
            this.localizationService.getLocalizedString("RemotePathMappingCheckImportFailed"),
            "#remote-path-import-failed"
          );
        }

        if (!new OsPath(dlpath).isRooted) {
          if (!status.isLocalhost) {
            return createHealthCheck(
              RemotePathMappingCheck,
              HealthCheckResult.Error,
              formatMessage(
                this.localizationService.getLocalizedString(
                  "RemotePathMappingCheckFilesWrongOSPath"
                ),
                client.definition.name,
                dlpath,
                this.osInfo.name
              ),
              "#bad-remote-path-mapping"
            );
          } else if (this.osInfo.isDocker) {
            return createHealthCheck(
              RemotePathMappingCheck,
              HealthCheckResult.Error,
              formatMessage(
                this.localizationService.getLocalizedString(
                  "RemotePathMappingCheckFilesBadDockerPath"
                ),
                client.definition.name,
                dlpath,
                this.osInfo.name
              ),
              "#docker-bad-remote-path-mapping"
            );
          } else {
            return createHealthCheck(
              RemotePathMappingCheck,
              HealthCheckResult.Error,
              formatMessage(
                this.localizationService.getLocalizedString(
                  "RemotePathMappingCheckFilesLocalWrongOSPath"
                ),
                client.definition.name,
                dlpath,
                this.osInfo.name
              ),
              "#bad-download-client-settings"
            );
          }
        }

        if (this.diskProvider.folderExists(dlpath)) {
          return createHealthCheck(
            RemotePathMappingCheck,
            HealthCheckResult.Error,
            formatMessage(
              this.localizationService.getLocalizedString(
                "RemotePathMappingCheckFolderPermissions"
              ),
              dlpath
            ),
            "#permissions-error"
          );
        }

        // if it's a remote client/docker, likely missing path mappings
        if (this.osInfo.isDocker) {
          // Ported faithfully: the real C# source passes TWO format args
          // (client.Definition.Name, dlpath) into the SAME
          // "RemotePathMappingCheckFolderPermissions" localization key used
          // just above with only ONE arg (dlpath) -- a real bug in the
          // original (that key's template presumably only has a `{0}`
          // placeholder, so the second arg is silently dropped by
          // string.Format). Preserved as-is, not fixed, per this port's
          // "faithful bugs, fixed later" rule.
          return createHealthCheck(
            RemotePathMappingCheck,
            HealthCheckResult.Error,
            formatMessage(
              this.localizationService.getLocalizedString(
                "RemotePathMappingCheckFolderPermissions"
              ),
              client.definition.name,
              dlpath
            ),
            "#docker-bad-remote-path-mapping"
          );
        } else if (!status.isLocalhost) {
          return createHealthCheck(
            RemotePathMappingCheck,
            HealthCheckResult.Error,
            formatMessage(
              this.localizationService.getLocalizedString(
                "RemotePathMappingCheckRemoteDownloadClient"
              ),
              client.definition.name,
              dlpath
            ),
            "#bad-remote-path-mapping"
          );
        } else {
          // path mappings shouldn't be needed locally so probably a permissions issue
          return createHealthCheck(
            RemotePathMappingCheck,
            HealthCheckResult.Error,
            formatMessage(
              this.localizationService.getLocalizedString(
                "RemotePathMappingCheckFilesGenericPermissions"
              ),
              client.definition.name,
              dlpath
            ),
            "#permissions-error"
          );
        }
      } catch (ex) {
        if (ex instanceof DownloadClientException || ex instanceof HttpException) {
          this.logger.debug(ex, "Unable to communicate with {0}", client.definition.name);
        } else {
          this.logger.error(ex, "Unknown error occured in RemotePathMapping HealthCheck");
        }
      }

      return createOkHealthCheck(RemotePathMappingCheck);
    } else {
      return this.check();
    }
  }
}

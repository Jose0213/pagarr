import { dirname } from "node:path";
import type { RootFolder } from "../../root-folders/root-folder.js";
import { pathEquals } from "../../root-folders/path-utils.js";
import { OsPath } from "../../download-clients/OsPath.js";
import { DownloadClientException } from "../../download-clients/DownloadClientException.js";
import type { CheckOnEntry } from "../checkOnAttribute.js";
import {
  createHealthCheck,
  createOkHealthCheck,
  HealthCheckResult,
  type HealthCheck,
} from "../healthCheck.js";
import { HealthCheckBase } from "../healthCheckBase.js";
import type { ILocalizationService } from "../localizationService.js";

/**
 * Ported from NzbDrone.Core/HealthCheck/Checks/CalibreRootFolderCheck.cs.
 *
 * `[CheckOn(typeof(ModelEvent<RootFolder>))]`/`[CheckOn(typeof(ModelEvent<
 * RemotePathMapping>))]` are NOT reproduced in `CHECK_ON` below:
 * `ModelEvent<TModel>` is a reified C# generic (`typeof(ModelEvent<RootFolder>)`
 * and `typeof(ModelEvent<RemotePathMapping>)` are distinct `Type` keys the
 * real reflection scan dispatches on independently), but at the TS/JS
 * runtime level there is only ONE `ModelEvent` constructor regardless of its
 * type parameter (see `db/events.ts`'s `ModelEvent<TModel>` -- a single
 * class, not a family of classes) -- so there is no single `EventCtor` key
 * this check could subscribe under that wouldn't also fire for every other
 * model's `ModelEvent`. This is the exact situation
 * `media-files-organize/rootFolderWatchingService.ts`'s doc comment already
 * hit and resolved: `Handle(ModelEvent<RootFolder>)` is exposed as a plain
 * public method for a caller to invoke after checking `event.model`'s
 * runtime shape itself, not a generic-keyed subscription. This check has no
 * analogous plain method since its `check()` doesn't branch on *which*
 * model changed (it just re-scans every calibre root folder from scratch
 * either way) -- the re-check is already fully covered by re-running
 * `check()` on ANY `ModelEvent` publish, which a caller can do by invoking
 * `check()` directly from a narrower `IHandle<ModelEvent<RootFolder>>` /
 * `IHandle<ModelEvent<RemotePathMapping>>` subscription once
 * RemotePathMappings' own event wiring exists.
 *
 * FORWARD-REFERENCES:
 *  - `ICalibreProxy` (`NzbDrone.Core.Books.Calibre`) -- Calibre integration
 *    is not part of any ported module yet (Books itself is ported, but its
 *    `Calibre/` subdirectory, a Content Server API client, is not). Narrowed
 *    to the one method this check calls: `GetAllBookFilePaths(calibreSettings)`.
 *  - `IOsInfo` (`NzbDrone.Common.EnvironmentInfo`) -- not ported anywhere
 *    (same gap `root-folders/path-utils.ts`'s doc comment documents via
 *    `process.platform` for OS-conditional path comparison, but this check
 *    additionally needs the *display name* `.Name`/`.IsDocker`, which
 *    process.platform alone doesn't give). Narrowed to `{ name, isDocker }`.
 *  - `IRootFolderService.All()`/`IDiskProvider.FolderExists`/`FileExists` are
 *    real (`root-folders/root-folder-service.ts`, `disk-provider.ts`) --
 *    `IDiskProvider.FileExists` isn't part of the ported 4-method
 *    `IDiskProvider` slice (`folderExists`/`folderWritable`/
 *    `getAvailableSpace`/`getTotalSize`) so it's added to a locally narrowed
 *    interface here, matching `disk-provider.ts`'s own doc comment: "so that
 *    a future full IDiskProvider port is a drop-in replacement".
 *  - `Path.GetDirectoryName` (three chained calls: book folder -> author
 *    folder -> library folder) uses Node's `dirname` directly rather than
 *    `OsPath.directory`, since C#'s `Path.GetDirectoryName` operates on
 *    *host*-OS path syntax (it's a plain string op, not a dual-OS-aware
 *    `OsPath`), and `dirname` is `node:path`'s equivalent for the host OS.
 */

export interface CalibreProxyLike {
  /** Ported from `ICalibreProxy.GetAllBookFilePaths(CalibreSettings settings)`. */
  getAllBookFilePaths(settings: NonNullable<RootFolder["calibreSettings"]>): string[];
}

export interface OsInfoLike {
  readonly name: string;
  readonly isDocker: boolean;
}

/** Narrowed slice of `IDiskProvider` this check needs -- see module doc comment. */
export interface CalibreRootFolderCheckDiskProvider {
  folderExists(path: string): boolean;
  fileExists(path: string): boolean;
}

export interface CalibreRootFolderCheckRootFolderService {
  all(): RootFolder[];
}

/** Minimal logger surface this check needs. */
export interface CalibreRootFolderCheckLogger {
  debug(errorOrMessage: unknown, message?: string, ...args: unknown[]): void;
  error(errorOrMessage: unknown, message?: string, ...args: unknown[]): void;
}

const noopLogger: CalibreRootFolderCheckLogger = { debug: () => {}, error: () => {} };

export const CHECK_ON: CheckOnEntry[] = [];

export class CalibreRootFolderCheck extends HealthCheckBase {
  constructor(
    private readonly diskProvider: CalibreRootFolderCheckDiskProvider,
    private readonly rootFolderService: CalibreRootFolderCheckRootFolderService,
    private readonly calibreProxy: CalibreProxyLike,
    private readonly osInfo: OsInfoLike,
    localizationService: ILocalizationService,
    private readonly logger: CalibreRootFolderCheckLogger = noopLogger
  ) {
    super(localizationService);
  }

  check(): HealthCheck {
    const rootFolders = this.rootFolderService.all().filter((x) => x.isCalibreLibrary);

    for (const folder of rootFolders) {
      try {
        const calibreSettings = folder.calibreSettings;
        if (!calibreSettings) {
          continue;
        }

        const calibreIsLocal =
          calibreSettings.host === "127.0.0.1" || calibreSettings.host === "localhost";

        const files = this.calibreProxy.getAllBookFilePaths(calibreSettings);
        if (files.length > 0) {
          const file = files[0]!;

          // This directory structure is forced by calibre
          const bookFolder = dirname(file);
          const authorFolder = dirname(bookFolder);
          const libraryFolder = dirname(authorFolder);

          const osPath = new OsPath(libraryFolder);

          if (!osPath.isRooted) {
            if (!calibreIsLocal) {
              return createHealthCheck(
                CalibreRootFolderCheck,
                HealthCheckResult.Error,
                `Remote calibre for root folder ${folder.name} reports files in ${libraryFolder} but this is not a valid ${this.osInfo.name} path.  Review your remote path mappings and root folder settings.`,
                "#bad-remote-path-mapping"
              );
            } else if (this.osInfo.isDocker) {
              return createHealthCheck(
                CalibreRootFolderCheck,
                HealthCheckResult.Error,
                `You are using docker; calibre for root folder ${folder.name} reports files in ${libraryFolder} but this is not a valid ${this.osInfo.name} path.  Review your remote path mappings and download client settings.`,
                "#docker-bad-remote-path-mapping"
              );
            } else {
              return createHealthCheck(
                CalibreRootFolderCheck,
                HealthCheckResult.Error,
                `Local calibre server for root folder ${folder.name} reports files in ${libraryFolder} but this is not a valid ${this.osInfo.name} path.  Review your download client settings.`,
                "#bad-download-client-settings"
              );
            }
          }

          if (!this.diskProvider.folderExists(libraryFolder)) {
            if (this.osInfo.isDocker) {
              return createHealthCheck(
                CalibreRootFolderCheck,
                HealthCheckResult.Error,
                `You are using docker; calibre server for root folder ${folder.name} places downloads in ${libraryFolder} but this directory does not appear to exist inside the container.  Review your remote path mappings and container volume settings.`,
                "#docker-bad-remote-path-mapping"
              );
            } else if (!calibreIsLocal) {
              return createHealthCheck(
                CalibreRootFolderCheck,
                HealthCheckResult.Error,
                `Remote calibre server for root folder ${folder.name} places downloads in ${libraryFolder} but this directory does not appear to exist.  Likely missing or incorrect remote path mapping.`,
                "#bad-remote-path-mapping"
              );
            } else {
              return createHealthCheck(
                CalibreRootFolderCheck,
                HealthCheckResult.Error,
                `Calibre server for root folder ${folder.name} places downloads in ${libraryFolder} but Readarr cannot see this directory.  You may need to adjust the folder's permissions or add a remote path mapping if calibre is running in docker`,
                "#permissions-error"
              );
            }
          }

          if (!this.diskProvider.fileExists(file)) {
            if (this.osInfo.isDocker) {
              return createHealthCheck(
                CalibreRootFolderCheck,
                HealthCheckResult.Error,
                `You are using docker; calibre server for root folder ${folder.name} listed file ${file} but this file does not appear to exist inside the container.  Review permissions for ${libraryFolder} and PUID/PGID container settings`,
                "#docker-bad-remote-path-mapping"
              );
            } else if (!calibreIsLocal) {
              return createHealthCheck(
                CalibreRootFolderCheck,
                HealthCheckResult.Error,
                `Remote calibre server for root folder ${folder.name} listed file ${file} but this file does not appear to exist.  Review permissions for ${libraryFolder}`,
                "#permissions-error"
              );
            } else {
              return createHealthCheck(
                CalibreRootFolderCheck,
                HealthCheckResult.Error,
                `Calibre server for root folder ${folder.name} listed file ${file} but Readarr cannot see this file.  Review permissions for ${libraryFolder}`,
                "#permissions-error"
              );
            }
          }

          if (!pathEquals(libraryFolder, folder.path)) {
            return createHealthCheck(
              CalibreRootFolderCheck,
              HealthCheckResult.Error,
              `Calibre for root folder ${folder.name} reports files in ${libraryFolder} but this is not the same as the root folder path ${folder.path} you chose.  You may need to edit any remote path mapping or delete the root folder and re-create with the correct path`,
              "#calibre-root-does-not-match"
            );
          }
        }
      } catch (ex) {
        if (ex instanceof DownloadClientException) {
          this.logger.debug(
            ex,
            "Unable to communicate with calibre server for root folder {0}",
            folder.name
          );
        } else {
          this.logger.error(ex, "Unknown error occured in CalibreRootFolderCheck HealthCheck");
        }
      }
    }

    return createOkHealthCheck(CalibreRootFolderCheck);
  }
}

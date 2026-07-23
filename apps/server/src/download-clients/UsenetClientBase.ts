import type { IConfigService } from "../config/configService.js";
import { HttpException } from "../http/HttpException.js";
import { HttpRequest } from "../http/HttpRequest.js";
import type { IHttpClient } from "../http/HttpClient.js";
import { DownloadProtocol } from "../indexers/DownloadProtocol.js";
import type { IIndexer } from "../indexers/IIndexer.js";
import type { IProviderConfig } from "../indexers/IIndexerSettings.js";
import {
  DownloadClientBase,
  noopDownloadClientLogger,
  withDownloadRetryStrategy,
  type DownloadClientLogger,
} from "./DownloadClientBase.js";
import type { IDiskProviderLike } from "./IDiskProviderLike.js";
import { cleanFileName } from "./fileNameCleaner.js";
import { ReleaseDownloadException, ReleaseUnavailableException } from "./TorrentClientBase.js";
import type { IRemotePathMappingService } from "./RemotePathMappingService.js";
import type { RemoteBookLike } from "./RemoteBookLike.js";

/**
 * Forward-ref for the slice of NzbDrone.Core/Download/NzbValidationService.cs
 * (`IValidateNzbs`) that `UsenetClientBase.Download` calls:
 * `Validate(filename, nzbData)`, throwing `InvalidNzbException` if the
 * downloaded bytes aren't a valid NZB document. `NzbValidationService`
 * itself lives directly under `Download/` in the real C# source but is NOT
 * in this worktree's explicit in-scope file list (only the specific files
 * named in the task brief are ported) -- so it's narrowed to this
 * single-method forward-ref, with a permissive default that accepts
 * anything (matching "no NZB validation configured" rather than silently
 * rejecting every download).
 */
export interface IValidateNzbs {
  validate(filename: string, nzbData: Uint8Array): void;
}

export const permissiveNzbValidator: IValidateNzbs = {
  validate: () => {},
};

/**
 * Ported from NzbDrone.Core/Download/UsenetClientBase.cs.
 *
 * Same WebException-collapse deviation as `TorrentClientBase.ts`'s doc
 * comment.
 */
export abstract class UsenetClientBase<
  TSettings extends IProviderConfig,
> extends DownloadClientBase<TSettings> {
  protected readonly httpClient: IHttpClient;
  private readonly nzbValidationService: IValidateNzbs;

  readonly protocol: DownloadProtocol = DownloadProtocol.Usenet;

  constructor(
    httpClient: IHttpClient,
    configService: IConfigService,
    diskProvider: IDiskProviderLike,
    remotePathMappingService: IRemotePathMappingService,
    nzbValidationService: IValidateNzbs = permissiveNzbValidator,
    logger: DownloadClientLogger = noopDownloadClientLogger
  ) {
    super(configService, diskProvider, remotePathMappingService, logger);
    this.httpClient = httpClient;
    this.nzbValidationService = nzbValidationService;
  }

  protected abstract addFromNzbFile(
    remoteBook: RemoteBookLike,
    filename: string,
    fileContent: Uint8Array
  ): Promise<string | null> | string | null;

  async download(remoteBook: RemoteBookLike, indexer: IIndexer | null): Promise<string | null> {
    const url = remoteBook.release.downloadUrl;
    const filename = `${cleanFileName(remoteBook.release.title)}.nzb`;

    let nzbData: Uint8Array;

    try {
      const request = indexer?.getDownloadRequest(url) ?? new HttpRequest(url);
      request.rateLimitKey = String(remoteBook.release.indexerId ?? "");

      const response = await withDownloadRetryStrategy(
        () => this.httpClient.get(request),
        (attempt, delayMs) => {
          this.logger.info(
            "Request for %s failed. Retrying in %ds. (attempt %d)",
            this.definition.name,
            delayMs / 1000,
            attempt
          );
        }
      );

      nzbData = response.responseData ?? new Uint8Array();

      this.logger.debug(
        "Downloaded nzb for release '%s' finished (%d bytes from %s)",
        remoteBook.release.title,
        nzbData.length,
        url
      );
    } catch (ex) {
      if (ex instanceof HttpException) {
        if (ex.response.statusCode === 404) {
          this.logger.error(
            "Downloading nzb file for book '%s' failed since it no longer exists (%s)",
            remoteBook.release.title,
            url
          );
          throw new ReleaseUnavailableException("Downloading torrent failed", ex);
        }

        if (ex.response.statusCode === 429) {
          this.logger.error("API Grab Limit reached for %s", url);
        } else {
          this.logger.error(
            "Downloading nzb for release '%s' failed (%s)",
            remoteBook.release.title,
            url,
            ex
          );
        }

        throw new ReleaseDownloadException("Downloading nzb failed", ex);
      }

      this.logger.error(
        "Downloading nzb for release '%s' failed (%s)",
        remoteBook.release.title,
        url,
        ex
      );

      throw new ReleaseDownloadException("Downloading nzb failed", ex);
    }

    this.nzbValidationService.validate(filename, nzbData);

    this.logger.info("Adding report [%s] to the queue.", remoteBook.release.title);
    return this.addFromNzbFile(remoteBook, filename, nzbData);
  }
}

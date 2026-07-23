import { createHash } from "node:crypto";
import type { IConfigService } from "../config/configService.js";
import { HttpException } from "../http/HttpException.js";
import { HttpRequest } from "../http/HttpRequest.js";
import { HttpUri } from "../http/HttpUri.js";
import type { IHttpClient } from "../http/HttpClient.js";
import { DownloadProtocol } from "../indexers/DownloadProtocol.js";
import type { IIndexer } from "../indexers/IIndexer.js";
import type { IProviderConfig } from "../indexers/IIndexerSettings.js";
import type { ITorrentIndexerSettings } from "../indexers/ITorrentIndexerSettings.js";
import { type BlocklistServiceLike, noopBlocklistService } from "./BlocklistServiceLike.js";
import {
  DownloadClientBase,
  noopDownloadClientLogger,
  withDownloadRetryStrategy,
  type DownloadClientLogger,
} from "./DownloadClientBase.js";
import type { IDiskProviderLike } from "./IDiskProviderLike.js";
import { cleanFileName } from "./fileNameCleaner.js";
import { parseMagnetLinkInfoHash } from "./magnetLink.js";
import type { IRemotePathMappingService } from "./RemotePathMappingService.js";
import { isTorrentInfo, ReleaseSourceType, type RemoteBookLike } from "./RemoteBookLike.js";

/**
 * Forward-ref for the two release-download exceptions
 * `TorrentClientBase.Download` throws (`NzbDrone.Core/Exceptions/
 * ReleaseDownloadException.cs` + `ReleaseUnavailableException.cs` +
 * `ReleaseBlockedException.cs`, from the not-yet-ported `NzbDrone.Core.Exceptions`
 * module -- out of scope, lives outside `Download/`). Ported as real `Error`
 * subclasses (not just documented as dropped) since callers of `.download()`
 * need to distinguish "release download failed" from other failure modes the
 * same way the C# caller (`DownloadService`) does via `catch
 * (ReleaseDownloadException)`.
 */
export class ReleaseDownloadException extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, { cause });
    this.name = "ReleaseDownloadException";
    Object.setPrototypeOf(this, ReleaseDownloadException.prototype);
  }
}

export class ReleaseUnavailableException extends ReleaseDownloadException {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
    this.name = "ReleaseUnavailableException";
    Object.setPrototypeOf(this, ReleaseUnavailableException.prototype);
  }
}

export class ReleaseBlockedException extends ReleaseDownloadException {
  constructor(message: string) {
    super(message);
    this.name = "ReleaseBlockedException";
    Object.setPrototypeOf(this, ReleaseBlockedException.prototype);
  }
}

/**
 * Ported from C#'s `System.NotSupportedException`, thrown by
 * `AddFromMagnetLink` overrides (QBittorrent when DHT is disabled and no
 * trackers are present; TorrentBlackhole when `SaveMagnetFiles` is off) to
 * signal "this client/configuration can't handle a magnet link" as opposed
 * to any other failure. `TorrentClientBase.Download`'s two `catch
 * (NotSupportedException ex)` blocks specifically narrow on this exception
 * type (see this class's call sites in `download()` below) -- any other
 * exception from `AddFromMagnetLink` (e.g. `ReleaseBlockedException` from
 * the blocklist check) must propagate unchanged, not get re-wrapped. A
 * dedicated subclass is needed here because plain `Error` would be
 * indistinguishable from every other failure mode.
 */
export class MagnetNotSupportedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MagnetNotSupportedError";
    Object.setPrototypeOf(this, MagnetNotSupportedError.prototype);
  }
}

/**
 * Ported from NzbDrone.Core/Download/TorrentClientBase.cs.
 *
 * DEVIATION -- error classification: same WebException-collapse rationale
 * as `indexers/HttpIndexerBase.ts`'s doc comment. C#'s separate `WebException`
 * catch block (network-level failures below the HTTP layer -- DNS, connect
 * refused) has no clean Node/undici equivalent distinct from a generic
 * thrown error; both branches are collapsed into a single catch that wraps
 * anything not an `HttpException`/`HttpException`-with-404 the same way the
 * C# `WebException` branch does (log + throw `ReleaseDownloadException`).
 */
export abstract class TorrentClientBase<
  TSettings extends IProviderConfig,
> extends DownloadClientBase<TSettings> {
  protected readonly httpClient: IHttpClient;
  private readonly blocklistService: BlocklistServiceLike;

  readonly protocol: DownloadProtocol = DownloadProtocol.Torrent;

  /** Ported from TorrentClientBase.PreferTorrentFile (virtual, default false). */
  get preferTorrentFile(): boolean {
    return false;
  }

  constructor(
    httpClient: IHttpClient,
    configService: IConfigService,
    diskProvider: IDiskProviderLike,
    remotePathMappingService: IRemotePathMappingService,
    blocklistService: BlocklistServiceLike = noopBlocklistService,
    logger: DownloadClientLogger = noopDownloadClientLogger
  ) {
    super(configService, diskProvider, remotePathMappingService, logger);
    this.httpClient = httpClient;
    this.blocklistService = blocklistService;
  }

  protected abstract addFromMagnetLink(
    remoteBook: RemoteBookLike,
    hash: string,
    magnetLink: string
  ): Promise<string | null> | string | null;
  protected abstract addFromTorrentFile(
    remoteBook: RemoteBookLike,
    hash: string,
    filename: string,
    fileContent: Uint8Array
  ): Promise<string | null> | string | null;

  async download(remoteBook: RemoteBookLike, indexer: IIndexer | null): Promise<string | null> {
    const torrentInfo = isTorrentInfo(remoteBook.release) ? remoteBook.release : null;

    let magnetUrl: string | null = null;
    let torrentUrl: string | null = null;

    if (
      remoteBook.release.downloadUrl != null &&
      remoteBook.release.downloadUrl.trim() !== "" &&
      remoteBook.release.downloadUrl.startsWith("magnet:")
    ) {
      magnetUrl = remoteBook.release.downloadUrl;
    } else {
      torrentUrl = remoteBook.release.downloadUrl;
    }

    if (torrentInfo != null && torrentInfo.magnetUrl != null && torrentInfo.magnetUrl !== "") {
      magnetUrl = torrentInfo.magnetUrl;
    }

    if (this.preferTorrentFile) {
      if (torrentUrl != null && torrentUrl !== "") {
        try {
          return await this.downloadFromWebUrl(remoteBook, indexer, torrentUrl);
        } catch (ex) {
          if (magnetUrl != null && magnetUrl !== "") {
            this.logger.debug("Torrent download failed, trying magnet. (%s)", errorMessage(ex));
          } else {
            throw ex;
          }
        }
      }

      if (magnetUrl != null && magnetUrl !== "") {
        try {
          return await this.downloadFromMagnetUrl(remoteBook, indexer, magnetUrl);
        } catch (ex) {
          if (!(ex instanceof MagnetNotSupportedError)) {
            throw ex;
          }
          throw new ReleaseDownloadException(
            `Magnet not supported by download client. (${errorMessage(ex)})`
          );
        }
      }
    } else {
      if (magnetUrl != null && magnetUrl !== "") {
        try {
          return await this.downloadFromMagnetUrl(remoteBook, indexer, magnetUrl);
        } catch (ex) {
          if (!(ex instanceof MagnetNotSupportedError)) {
            throw ex;
          }

          if (torrentUrl == null || torrentUrl === "") {
            throw new ReleaseDownloadException(
              `Magnet not supported by download client. (${errorMessage(ex)})`
            );
          }

          this.logger.debug(
            "Magnet not supported by download client, trying torrent. (%s)",
            errorMessage(ex)
          );
        }
      }

      if (torrentUrl != null && torrentUrl !== "") {
        return await this.downloadFromWebUrl(remoteBook, indexer, torrentUrl);
      }
    }

    return null;
  }

  private async downloadFromWebUrl(
    remoteBook: RemoteBookLike,
    indexer: IIndexer | null,
    torrentUrl: string
  ): Promise<string | null> {
    let torrentFile: Uint8Array;

    try {
      const request = indexer?.getDownloadRequest(torrentUrl) ?? new HttpRequest(torrentUrl);
      request.rateLimitKey = String(remoteBook.release.indexerId ?? "");
      request.headers.accept = "application/x-bittorrent";
      request.allowAutoRedirect = false;

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

      if (
        response.statusCode === 301 ||
        response.statusCode === 302 ||
        response.statusCode === 303
      ) {
        const locationHeader = response.headers.getSingleValue("Location");

        this.logger.trace("Torrent request is being redirected to: %s", locationHeader);

        if (locationHeader != null) {
          if (locationHeader.startsWith("magnet:")) {
            return await this.downloadFromMagnetUrl(remoteBook, indexer, locationHeader);
          }

          request.url = HttpUri.combine(request.url, new HttpUri(locationHeader));

          return await this.downloadFromWebUrl(remoteBook, indexer, request.url.toString());
        }

        throw new Error("Remote website tried to redirect without providing a location.");
      }

      torrentFile = response.responseData ?? new Uint8Array();

      this.logger.debug(
        "Downloading torrent for release '%s' finished (%d bytes from %s)",
        remoteBook.release.title,
        torrentFile.length,
        torrentUrl
      );
    } catch (ex) {
      if (ex instanceof HttpException) {
        if (ex.response.statusCode === 404) {
          this.logger.error(
            "Downloading torrent file for book '%s' failed since it no longer exists (%s)",
            remoteBook.release.title,
            torrentUrl
          );
          throw new ReleaseUnavailableException("Downloading torrent failed", ex);
        }

        if (ex.response.statusCode === 429) {
          this.logger.error("API Grab Limit reached for %s", torrentUrl);
        } else {
          this.logger.error(
            "Downloading torrent file for release '%s' failed (%s)",
            remoteBook.release.title,
            torrentUrl,
            ex
          );
        }

        throw new ReleaseDownloadException("Downloading torrent failed", ex);
      }

      this.logger.error(
        "Downloading torrent file for release '%s' failed (%s)",
        remoteBook.release.title,
        torrentUrl,
        ex
      );

      throw new ReleaseDownloadException("Downloading torrent failed", ex);
    }

    const filename = `${cleanFileName(remoteBook.release.title)}.torrent`;
    const hash = getHashFromTorrentFile(torrentFile);

    this.ensureReleaseIsNotBlocklisted(remoteBook, indexer, hash);

    const actualHash = await this.addFromTorrentFile(remoteBook, hash, filename, torrentFile);

    if (actualHash != null && actualHash !== "" && hash !== actualHash) {
      this.logger.debug(
        "%s did not return the expected InfoHash for '%s', Pagarr could potentially lose track of the download in progress.",
        this.definition.implementation,
        remoteBook.release.downloadUrl
      );
    }

    return actualHash;
  }

  private async downloadFromMagnetUrl(
    remoteBook: RemoteBookLike,
    indexer: IIndexer | null,
    magnetUrl: string
  ): Promise<string | null> {
    let hash: string;
    let actualHash: string | null = null;

    try {
      hash = parseMagnetLinkInfoHash(magnetUrl);
    } catch (ex) {
      this.logger.error(
        "Failed to parse magnetlink for release '%s': '%s'",
        remoteBook.release.title,
        magnetUrl,
        ex
      );

      return null;
    }

    if (hash != null) {
      this.ensureReleaseIsNotBlocklisted(remoteBook, indexer, hash);

      actualHash = await this.addFromMagnetLink(remoteBook, hash, magnetUrl);
    }

    if (actualHash != null && actualHash !== "" && hash !== actualHash) {
      this.logger.debug(
        "%s did not return the expected InfoHash for '%s', Pagarr could potentially lose track of the download in progress.",
        this.definition.implementation,
        remoteBook.release.downloadUrl
      );
    }

    return actualHash;
  }

  /**
   * Ported from TorrentClientBase.EnsureReleaseIsNotBlocklisted(). `indexer`
   * param narrowed to only what's read (`definition.settings` cast to
   * `ITorrentIndexerSettings`, for the `RejectBlocklistedTorrentHashesWhileGrabbing`
   * flag).
   */
  private ensureReleaseIsNotBlocklisted(
    remoteBook: RemoteBookLike,
    indexer: IIndexer | null,
    hash: string
  ): void {
    const indexerSettings = indexer?.definition?.settings as
      (ITorrentIndexerSettings & IProviderConfig) | null | undefined;
    const torrentInfo = isTorrentInfo(remoteBook.release) ? remoteBook.release : null;
    const torrentInfoHash = torrentInfo?.infoHash;

    // If the release didn't come from an interactive search, the hash
    // wasn't known during processing and the indexer is configured to
    // reject blocklisted releases during grab check if it's already been
    // blocklisted.
    if (torrentInfo != null && (torrentInfoHash == null || torrentInfoHash === "")) {
      // If the hash isn't known from parsing we set it here so it can be
      // used for blocklisting.
      torrentInfo.infoHash = hash;

      if (
        remoteBook.releaseSource !== ReleaseSourceType.InteractiveSearch &&
        indexerSettings?.rejectBlocklistedTorrentHashesWhileGrabbing === true &&
        this.blocklistService.blocklistedTorrentHash(remoteBook.author.id, hash)
      ) {
        throw new ReleaseBlockedException("Release previously added to blocklist");
      }
    }
  }
}

function errorMessage(ex: unknown): string {
  return ex instanceof Error ? ex.message : String(ex);
}

/**
 * Forward-ref/narrow-port of `ITorrentFileInfoReader.GetHashFromTorrentFile`
 * (`NzbDrone.Core/MediaFiles/TorrentInfo/TorrentFileInfoReader.cs`, not part
 * of this worktree's scope -- MediaFiles is a sibling not-yet-ported
 * module). Extracts the BitTorrent info-hash (SHA-1 of the bencoded `info`
 * dictionary) directly from raw `.torrent` file bytes via a minimal bencode
 * parser, matching the real reader's actual computation (MonoTorrent's
 * `Torrent.Load(data).InfoHash.ToHex()` under the hood) without depending on
 * MonoTorrent.
 */
export function getHashFromTorrentFile(fileContent: Uint8Array): string {
  const infoSpan = findBencodedInfoDictSpan(fileContent);

  if (!infoSpan) {
    throw new Error("Unable to locate 'info' dictionary in torrent file.");
  }

  return sha1Hex(fileContent.slice(infoSpan.start, infoSpan.end)).toUpperCase();
}

function findBencodedInfoDictSpan(data: Uint8Array): { start: number; end: number } | null {
  // Minimal bencode dictionary walk: find the top-level "info" key at the
  // root dict and return the byte span of its value (which must itself be a
  // dictionary, `d...e`).
  let pos = 0;

  if (data[pos] !== 0x64 /* 'd' */) {
    return null;
  }
  pos++;

  while (pos < data.length && data[pos] !== 0x65 /* 'e' */) {
    const key = readBencodedString(data, pos);
    if (!key) {
      return null;
    }
    pos = key.end;

    const decodedKey = new TextDecoder("latin1").decode(
      data.slice(key.valueStart, key.valueStart + key.length)
    );

    const valueStart = pos;
    const valueEnd = skipBencodedValue(data, pos);
    if (valueEnd === null) {
      return null;
    }

    if (decodedKey === "info") {
      return { start: valueStart, end: valueEnd };
    }

    pos = valueEnd;
  }

  return null;
}

function readBencodedString(
  data: Uint8Array,
  pos: number
): { valueStart: number; length: number; end: number } | null {
  let i = pos;
  let digits = "";
  while (i < data.length && data[i]! >= 0x30 && data[i]! <= 0x39) {
    digits += String.fromCharCode(data[i]!);
    i++;
  }
  if (digits === "" || data[i] !== 0x3a /* ':' */) {
    return null;
  }
  const length = Number.parseInt(digits, 10);
  const valueStart = i + 1;
  const end = valueStart + length;
  if (end > data.length) {
    return null;
  }
  return { valueStart, length, end };
}

function skipBencodedValue(data: Uint8Array, pos: number): number | null {
  const b = data[pos];
  if (b === undefined) {
    return null;
  }

  if (b === 0x69 /* 'i' */) {
    const end = data.indexOf(0x65, pos);
    return end === -1 ? null : end + 1;
  }

  if (b >= 0x30 && b <= 0x39) {
    const str = readBencodedString(data, pos);
    return str ? str.end : null;
  }

  if (b === 0x6c /* 'l' */) {
    let i = pos + 1;
    while (i < data.length && data[i] !== 0x65) {
      const next = skipBencodedValue(data, i);
      if (next === null) {
        return null;
      }
      i = next;
    }
    return i + 1;
  }

  if (b === 0x64 /* 'd' */) {
    let i = pos + 1;
    while (i < data.length && data[i] !== 0x65) {
      const key = readBencodedString(data, i);
      if (!key) {
        return null;
      }
      i = key.end;
      const next = skipBencodedValue(data, i);
      if (next === null) {
        return null;
      }
      i = next;
    }
    return i + 1;
  }

  return null;
}

function sha1Hex(data: Uint8Array): string {
  return createHash("sha1").update(data).digest("hex");
}

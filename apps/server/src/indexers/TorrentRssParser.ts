import type { IndexerResponse } from "./IndexerResponse.js";
import { createTorrentInfo, type ReleaseInfo, type TorrentInfo } from "./releaseInfo.js";
import { RssParser, TORRENT_ENCLOSURE_MIME_TYPES } from "./RssParser.js";
import { XElement } from "./xml/XElement.js";

const PARSE_SEEDERS_REGEX = new RegExp(
  "(Seeder)s?:\\s+(?<value>\\d+)|(?<value>\\d+)\\s+(seeder)s?",
  "gi"
);
const PARSE_LEECHERS_REGEX = new RegExp(
  "(Leecher)s?:\\s+(?<value>\\d+)|(?<value>\\d+)\\s+(leecher)s?",
  "gi"
);
const PARSE_PEERS_REGEX = new RegExp(
  "(Peer)s?:\\s+(?<value>\\d+)|(?<value>\\d+)\\s+(peer)s?",
  "gi"
);

/**
 * Ported from NzbDrone.Core/Indexers/TorrentRssParser.cs. Shared torrent-RSS
 * base for TorznabRssParser (in-scope) -- not itself one of the excluded
 * per-tracker scrapers (TorrentRss/EzrssTorrentRssParser.cs, which extend
 * *this* class for legacy generic-torrent-RSS trackers, ARE excluded per
 * the task's out-of-scope list).
 */
export class TorrentRssParser extends RssParser {
  parseSeedersInDescription = false;
  sizeElementName: string | null = null;

  constructor(...args: ConstructorParameters<typeof RssParser>) {
    super(...args);
    this.preferredEnclosureMimeTypes = TORRENT_ENCLOSURE_MIME_TYPES;
  }

  /** Ported from TorrentRssParser.GetItems(IndexerResponse indexerResponse). */
  getItemsForResponse(indexerResponse: IndexerResponse): XElement[] {
    const document = this.loadXmlDocument(indexerResponse);
    return this.getItems(document);
  }

  protected override createNewReleaseInfo(): ReleaseInfo {
    return createTorrentInfo();
  }

  protected override processItemFields(item: XElement, releaseInfo: ReleaseInfo): TorrentInfo {
    const result = super.processItemFields(item, releaseInfo) as TorrentInfo;

    result.infoHash = this.getInfoHash(item);
    result.magnetUrl = this.getMagnetUrl(item);
    result.seeders = this.getSeeders(item);
    result.peers = this.getPeers(item);

    return result;
  }

  protected getInfoHash(item: XElement): string | null {
    const magnetUrl = this.getMagnetUrl(item);

    if (magnetUrl !== null && magnetUrl.trim() !== "") {
      const infoHash = parseInfoHashFromMagnet(magnetUrl);
      if (infoHash !== null) {
        return infoHash;
      }
    }

    return null;
  }

  protected getMagnetUrl(item: XElement): string | null {
    const downloadUrl = this.getDownloadUrl(item);

    if (downloadUrl !== null && downloadUrl.trim() !== "" && downloadUrl.startsWith("magnet:")) {
      return downloadUrl;
    }

    return null;
  }

  protected getSeeders(item: XElement): number | null {
    if (this.parseSeedersInDescription && item.element("description") !== null) {
      const description = item.element("description")!.value;

      PARSE_SEEDERS_REGEX.lastIndex = 0;
      const matchSeeders = PARSE_SEEDERS_REGEX.exec(description);

      if (matchSeeders?.groups?.["value"]) {
        return Number.parseInt(matchSeeders.groups["value"], 10);
      }

      PARSE_PEERS_REGEX.lastIndex = 0;
      PARSE_LEECHERS_REGEX.lastIndex = 0;
      const matchPeers = PARSE_PEERS_REGEX.exec(description);
      const matchLeechers = PARSE_LEECHERS_REGEX.exec(description);

      if (matchPeers?.groups?.["value"] && matchLeechers?.groups?.["value"]) {
        return (
          Number.parseInt(matchPeers.groups["value"], 10) -
          Number.parseInt(matchLeechers.groups["value"], 10)
        );
      }
    }

    return null;
  }

  protected getPeers(item: XElement): number | null {
    if (this.parseSeedersInDescription && item.element("description") !== null) {
      const description = item.element("description")!.value;

      PARSE_PEERS_REGEX.lastIndex = 0;
      const matchPeers = PARSE_PEERS_REGEX.exec(description);

      if (matchPeers?.groups?.["value"]) {
        return Number.parseInt(matchPeers.groups["value"], 10);
      }

      PARSE_SEEDERS_REGEX.lastIndex = 0;
      PARSE_LEECHERS_REGEX.lastIndex = 0;
      const matchSeeders = PARSE_SEEDERS_REGEX.exec(description);
      const matchLeechers = PARSE_LEECHERS_REGEX.exec(description);

      if (matchSeeders?.groups?.["value"] && matchLeechers?.groups?.["value"]) {
        return (
          Number.parseInt(matchSeeders.groups["value"], 10) +
          Number.parseInt(matchLeechers.groups["value"], 10)
        );
      }
    }

    return null;
  }

  protected override getSize(item: XElement): number {
    const size = super.getSize(item);

    if (size === 0 && this.sizeElementName !== null && this.sizeElementName.trim() !== "") {
      const element = item.element(this.sizeElementName);
      if (element !== null) {
        return RssParser.parseSize(element.value, true);
      }
    }

    return size;
  }
}

/**
 * Ported from `MagnetLink.Parse(magnetUrl).InfoHash.ToHex()` (MonoTorrent).
 * Extracts the `xt=urn:btih:<hash>` info-hash parameter from a magnet URI --
 * the only piece of full magnet-link parsing this module's callers need.
 */
function parseInfoHashFromMagnet(magnetUrl: string): string | null {
  try {
    const match = /xt=urn:btih:([a-fA-F0-9]{40}|[a-zA-Z2-7]{32})/.exec(magnetUrl);
    return match ? match[1]!.toLowerCase() : null;
  } catch {
    return null;
  }
}

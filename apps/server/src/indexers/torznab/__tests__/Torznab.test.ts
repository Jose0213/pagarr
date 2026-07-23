import { describe, expect, it, vi } from "vitest";
import { HttpHeader } from "../../../http/HttpHeader.js";
import { HttpResponse } from "../../../http/HttpResponse.js";
import type { IHttpClient } from "../../../http/HttpClient.js";
import { createIndexerDefinition } from "../../IndexerDefinition.js";
import type { IIndexerStatusService } from "../../IndexerStatusService.js";
import type { NewznabCapabilities } from "../../newznab/NewznabCapabilities.js";
import { createNewznabCapabilities } from "../../newznab/NewznabCapabilities.js";
import type { INewznabCapabilitiesProvider } from "../../newznab/NewznabCapabilitiesProvider.js";
import type { TorrentInfo } from "../../releaseInfo.js";
import { readFixture } from "../../__tests__/testFixtures.js";
import { Torznab } from "../Torznab.js";
import { createTorznabSettings } from "../torznabSettings.js";

function fakeIndexerStatusService(): IIndexerStatusService {
  return {
    getBlockedProviders: vi.fn(() => []),
    recordSuccess: vi.fn(),
    recordFailure: vi.fn(),
    recordConnectionFailure: vi.fn(),
    getLastRssSyncReleaseInfo: vi.fn(() => null),
    updateRssSyncStatus: vi.fn(),
  };
}

function fakeConfigService(): never {
  // Not called anywhere in HttpIndexerBase/IndexerBase's in-scope logic
  // (see indexerBase.ts's doc comment) -- tests never need a real one.
  return undefined as never;
}

function capabilitiesProviderReturning(caps: NewznabCapabilities): INewznabCapabilitiesProvider {
  return { getCapabilities: vi.fn(async () => caps) };
}

function httpClientReturning(content: string): IHttpClient {
  const get = vi.fn(async (request) => new HttpResponse(request, new HttpHeader(), content, 200));
  return {
    execute: get,
    get,
    head: get,
    post: get,
    getTyped: vi.fn(),
    postTyped: vi.fn(),
    downloadFile: vi.fn(),
  };
}

function buildSubject(caps: NewznabCapabilities, feedContent: string) {
  const capabilitiesProvider = capabilitiesProviderReturning(caps);
  const httpClient = httpClientReturning(feedContent);
  const indexerStatusService = fakeIndexerStatusService();

  const subject = new Torznab(
    capabilitiesProvider,
    httpClient,
    indexerStatusService,
    fakeConfigService(),
    null
  );
  subject.definition = createIndexerDefinition({
    id: 1,
    name: "Torznab",
    settings: createTorznabSettings({ baseUrl: "http://indexer.local/", categories: [1] }),
  });

  return { subject, capabilitiesProvider, httpClient, indexerStatusService };
}

describe("Torznab", () => {
  it("parses the recent feed from a real torznab_hdaccess_net.xml fixture", async () => {
    const caps = createNewznabCapabilities({
      categories: [{ id: 1, name: "Test", description: "", subcategories: [] }],
    });
    const { subject } = buildSubject(caps, readFixture("torznab_hdaccess_net.xml"));

    const releases = (await subject.fetchRecent()) as TorrentInfo[];

    expect(releases).toHaveLength(5);

    const release = releases[0]!;
    expect(release.title).toBe(
      "Better Call Saul S01E05 Alpine Shepherd 1080p NF WEBRip DD5.1 x264"
    );
    expect(release.downloadProtocol).toBe(2); // DownloadProtocol.Torrent
    expect(release.downloadUrl).toBe(
      "https://hdaccess.net/download.php?torrent=11515&passkey=123456"
    );
    expect(release.infoUrl).toBe("https://hdaccess.net/details.php?id=11515&hit=1");
    expect(release.commentUrl).toBe("https://hdaccess.net/details.php?id=11515&hit=1#comments");
    expect(release.indexer).toBe("Torznab");
    // Source pubDate "Sat, 14 Mar 2015 17:10:42 -0400" == 21:10:42 UTC.
    expect(release.publishDate).toBe(new Date("2015-03-14T21:10:42.000Z").toISOString());
    expect(release.size).toBe(2538463390);
    expect(release.infoHash).toBe("63e07ff523710ca268567dad344ce1e0e6b7e8a3");
    expect(release.seeders).toBe(7);
    expect(release.peers).toBe(7);
  });

  it("parses the recent feed from a real torznab_tpb.xml fixture (magnet-link releases)", async () => {
    const caps = createNewznabCapabilities({
      categories: [{ id: 1, name: "Test", description: "", subcategories: [] }],
    });
    const { subject } = buildSubject(caps, readFixture("torznab_tpb.xml"));

    const releases = (await subject.fetchRecent()) as TorrentInfo[];

    expect(releases).toHaveLength(5);

    const release = releases[0]!;
    expect(release.title).toBe("Series Title S05E02 HDTV x264-Xclusive [eztv]");
    expect(release.downloadProtocol).toBe(2);
    // NOTE: the fixture's <torznab:attr name="magneturl"> value is itself
    // %2F%2F-encoded (verified against the real Readarr fixture file) --
    // TorznabRssParser.GetMagnetUrl() reads that attribute completely raw
    // (no URL-decoding), so the parsed MagnetUrl preserves the encoding
    // as-is. This matches TorznabFixture.cs's actual assertion exactly.
    expect(release.magnetUrl).toBe(
      "magnet:?xt=urn:btih:9fb267cff5ae5603f07a347676ec3bf3e35f75e1&dn=Game+of+Thrones+S05E02+HDTV+x264-Xclusive+%5Beztv%5D&tr=udp:%2F%2Fopen.demonii.com:1337&tr=udp:%2F%2Ftracker.coppersurfer.tk:6969&tr=udp:%2F%2Ftracker.leechers-paradise.org:6969&tr=udp:%2F%2Fexodus.desync.com:6969"
    );
    expect(release.downloadUrl).toBe(release.magnetUrl);
    expect(release.infoUrl).toBe(
      "https://thepiratebay.se/torrent/11811366/Series_Title_S05E02_HDTV_x264-Xclusive_%5Beztv%5D"
    );
    expect(release.indexer).toBe("Torznab");
    expect(new Date(release.publishDate).toISOString()).toBe(
      new Date("Sat, 11 Apr 2015 21:34:00 -0600").toISOString()
    );
    expect(release.size).toBe(388895872);
    expect(release.infoHash).toBe("9fb267cff5ae5603f07a347676ec3bf3e35f75e1");
    expect(release.seeders).toBe(34128);
    expect(release.peers).toBe(36724);
  });

  it("uses the best page size reported by capabilities, capped at 100", async () => {
    const caps = createNewznabCapabilities({ maxPageSize: 30, defaultPageSize: 25 });
    const { subject } = buildSubject(caps, "<rss><channel></channel></rss>");

    expect(await subject.resolvePageSize()).toBe(30);
  });

  it("never uses a page size over 100 even if capabilities report more", async () => {
    const caps = createNewznabCapabilities({ maxPageSize: 250, defaultPageSize: 25 });
    const { subject } = buildSubject(caps, "<rss><channel></channel></rss>");

    expect(await subject.resolvePageSize()).toBe(100);
  });

  describe("jackettAll (Jackett aggregate-endpoint guard)", () => {
    it("does not flag a normal url/apiPath combination", () => {
      const { subject } = buildSubject(createNewznabCapabilities(), "");
      subject.definition.settings = createTorznabSettings({
        baseUrl: "http://localhost:9117/",
        apiPath: "/api",
      });

      expect(subject.jackettAll()).toBeNull();
    });

    it("flags (as a warning) when baseUrl contains Jackett's /torznab/all path", () => {
      const { subject } = buildSubject(createNewznabCapabilities(), "");
      subject.definition.settings = createTorznabSettings({
        baseUrl: "http://localhost:9117/torznab/all/api",
      });

      const failure = subject.jackettAll();
      expect(failure).not.toBeNull();
      expect(failure!.isWarning).toBe(true);
    });

    it("flags (as a warning) when apiPath contains Jackett's all-indexers-results path", () => {
      const { subject } = buildSubject(createNewznabCapabilities(), "");
      subject.definition.settings = createTorznabSettings({
        baseUrl: "http://localhost:9117/",
        apiPath: "/api/v2.0/indexers/all/results/torznab",
      });

      const failure = subject.jackettAll();
      expect(failure).not.toBeNull();
      expect(failure!.isWarning).toBe(true);
    });
  });
});

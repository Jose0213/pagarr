import { describe, expect, it, vi } from "vitest";
import { HttpHeader } from "../../http/HttpHeader.js";
import { HttpException } from "../../http/HttpException.js";
import { HttpResponse } from "../../http/HttpResponse.js";
import { DownloadProtocol } from "../../indexers/DownloadProtocol.js";
import { createDownloadClientDefinition } from "../DownloadClientDefinition.js";
import {
  ReleaseBlockedException,
  ReleaseDownloadException,
  ReleaseUnavailableException,
  TorrentClientBase,
} from "../TorrentClientBase.js";
import type { RemoteBookLike } from "../RemoteBookLike.js";
import type { DownloadClientItem } from "../DownloadClientItem.js";
import type { DownloadClientInfo } from "../DownloadClientInfo.js";
import {
  fakeConfigService,
  fakeDiskProvider,
  fakeHttpClient,
  fakeIndexer,
  createTestRemoteBook,
} from "./testFixtures.js";
import { identityRemotePathMappingService } from "../RemotePathMappingService.js";

interface TestSettings {
  validate: () => { isValid: boolean; hasWarnings: boolean; errors: never[] };
}

class TestTorrentClient extends TorrentClientBase<TestSettings> {
  readonly name = "TestTorrent";

  addFromMagnetCalls: { hash: string; magnetLink: string }[] = [];
  addFromTorrentFileCalls: { hash: string; filename: string; length: number }[] = [];
  addFromMagnetResult: string | null = "resolved-hash";
  addFromTorrentResult: string | null = null; // null => defaults to returned hash echoed back by caller logic

  protected addFromMagnetLink(_remoteBook: RemoteBookLike, hash: string, magnetLink: string) {
    this.addFromMagnetCalls.push({ hash, magnetLink });
    return this.addFromMagnetResult ?? hash;
  }

  protected addFromTorrentFile(
    _remoteBook: RemoteBookLike,
    hash: string,
    filename: string,
    fileContent: Uint8Array
  ) {
    this.addFromTorrentFileCalls.push({ hash, filename, length: fileContent.length });
    return hash;
  }

  getItems(): DownloadClientItem[] {
    return [];
  }

  removeItem(): void {}

  getStatus(): DownloadClientInfo {
    return { isLocalhost: true, removesCompletedDownloads: false, outputRootFolders: [] };
  }

  protected async testConnection(): Promise<void> {}
}

function buildClient(overrides: { httpImpl?: Parameters<typeof fakeHttpClient>[0] } = {}) {
  const httpClient = fakeHttpClient(overrides.httpImpl);
  const client = new TestTorrentClient(
    httpClient,
    fakeConfigService(),
    fakeDiskProvider(),
    identityRemotePathMappingService
  );
  client.definition = createDownloadClientDefinition({
    id: 1,
    name: "TestTorrent",
    implementation: "Test",
  });
  return { client, httpClient };
}

// A real bencoded .torrent file with a single-file info dict, so
// getHashFromTorrentFile() can compute a real SHA-1 info-hash from it.
function fakeTorrentFileBytes(): Uint8Array {
  const bencoded = "d8:announce3:foo4:infod6:lengthi100e4:name5:filesee";
  return new TextEncoder().encode(bencoded);
}

describe("TorrentClientBase", () => {
  describe("download() with a magnet URL", () => {
    it("parses the info hash and calls addFromMagnetLink", async () => {
      const { client } = buildClient();
      const remoteBook = createTestRemoteBook({
        release: {
          ...createTestRemoteBook().release,
          downloadUrl:
            "magnet:?xt=urn:btih:CBC2F069FE8BB2F544EAE707D75BCD3DE9DCF951&tr=udp://tracker",
        },
      });

      const id = await client.download(remoteBook, null);

      expect(id).toBe("resolved-hash");
      expect(client.addFromMagnetCalls).toHaveLength(1);
      expect(client.addFromMagnetCalls[0]!.hash).toBe("CBC2F069FE8BB2F544EAE707D75BCD3DE9DCF951");
    });

    it("checks the blocklist before adding, and rejects a blocklisted torrent hash", async () => {
      const blocklistService = { blocklistedTorrentHash: vi.fn(() => true) };
      const httpClient = fakeHttpClient();
      const client = new TestTorrentClient(
        httpClient,
        fakeConfigService(),
        fakeDiskProvider(),
        identityRemotePathMappingService,
        blocklistService
      );
      client.definition = createDownloadClientDefinition({ id: 1, name: "TestTorrent" });

      const indexer = fakeIndexer();
      indexer.definition.settings = {
        baseUrl: "http://x/",
        earlyReleaseLimit: null,
        minimumSeeders: 1,
        seedCriteria: { seedRatio: null, seedTime: null, discographySeedTime: null },
        rejectBlocklistedTorrentHashesWhileGrabbing: true,
        validate: () => ({ isValid: true, hasWarnings: false, errors: [] }),
      } as never;

      const remoteBook = createTestRemoteBook({
        release: {
          ...createTestRemoteBook().release,
          downloadProtocol: DownloadProtocol.Torrent,
          downloadUrl: "magnet:?xt=urn:btih:CBC2F069FE8BB2F544EAE707D75BCD3DE9DCF951&tr=udp",
          // Cast the release to look like a TorrentInfo (isTorrentInfo checks for "seeders" key)
          ...({ seeders: 1, peers: 0 } as never),
        },
      });

      await expect(client.download(remoteBook, indexer)).rejects.toThrow(ReleaseBlockedException);
    });
  });

  describe("download() with a torrent URL", () => {
    it("downloads the .torrent file and calls addFromTorrentFile with the computed hash", async () => {
      const bytes = fakeTorrentFileBytes();
      const { client } = buildClient({
        httpImpl: {
          get: vi.fn(async (req) => new HttpResponse(req, new HttpHeader(), bytes, 200)),
        },
      });

      const remoteBook = createTestRemoteBook();
      const id = await client.download(remoteBook, null);

      expect(client.addFromTorrentFileCalls).toHaveLength(1);
      expect(id).toBeTruthy();
    });

    it("follows a redirect Location header pointing at another torrent URL", async () => {
      const bytes = fakeTorrentFileBytes();
      let callCount = 0;
      const { client } = buildClient({
        httpImpl: {
          get: vi.fn(async (req) => {
            callCount++;
            if (callCount === 1) {
              const headers = new HttpHeader({ Location: "http://elsewhere.com/real.torrent" });
              return new HttpResponse(req, headers, new Uint8Array(), 302);
            }
            return new HttpResponse(req, new HttpHeader(), bytes, 200);
          }),
        },
      });

      const remoteBook = createTestRemoteBook();
      const id = await client.download(remoteBook, null);

      expect(callCount).toBe(2);
      expect(id).toBeTruthy();
    });

    it("follows a redirect Location header pointing at a magnet link", async () => {
      const { client } = buildClient({
        httpImpl: {
          get: vi.fn(async (req) => {
            const headers = new HttpHeader({
              Location: "magnet:?xt=urn:btih:CBC2F069FE8BB2F544EAE707D75BCD3DE9DCF951&tr=udp",
            });
            return new HttpResponse(req, headers, new Uint8Array(), 303);
          }),
        },
      });

      const remoteBook = createTestRemoteBook();
      const id = await client.download(remoteBook, null);

      expect(id).toBe("resolved-hash");
      expect(client.addFromMagnetCalls).toHaveLength(1);
    });

    it("throws ReleaseUnavailableException on a 404", async () => {
      const { client } = buildClient({
        httpImpl: {
          get: vi.fn(async (req) => {
            const response = new HttpResponse(req, new HttpHeader(), new Uint8Array(), 404);
            throw new HttpException(req, response);
          }),
        },
      });

      const remoteBook = createTestRemoteBook();
      await expect(client.download(remoteBook, null)).rejects.toThrow(ReleaseUnavailableException);
    });

    it("throws ReleaseDownloadException on other HTTP failures (retrying twice on 5xx first)", async () => {
      vi.useFakeTimers();
      try {
        const { client, httpClient } = buildClient({
          httpImpl: {
            get: vi.fn(async (req) => {
              const response = new HttpResponse(req, new HttpHeader(), new Uint8Array(), 500);
              throw new HttpException(req, response);
            }),
          },
        });

        const remoteBook = createTestRemoteBook();
        const promise = client.download(remoteBook, null);
        const assertion = expect(promise).rejects.toThrow(ReleaseDownloadException);

        // Two retries with exponential backoff (base 3s, +/-20% jitter) --
        // advance well past the worst case (3.6s + 7.2s) in one jump.
        await vi.advanceTimersByTimeAsync(15000);

        await assertion;
        // Initial attempt + 2 retries = 3 calls to the retry strategy.
        expect(httpClient.get).toHaveBeenCalledTimes(3);
      } finally {
        vi.useRealTimers();
      }
    }, 10000);
  });
});

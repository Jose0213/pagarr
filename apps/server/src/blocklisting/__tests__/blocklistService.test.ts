import { describe, expect, it, vi } from "vitest";
import { BlocklistService } from "../blocklistService.js";
import type { IBlocklistRepository } from "../blocklistRepository.js";
import { newBlocklist, type Blocklist } from "../blocklist.js";
import { newQualityModel } from "../../qualities/qualityModel.js";
import { DownloadProtocol } from "../../indexers/DownloadProtocol.js";
import type { ReleaseInfo, TorrentInfo, RemoteBook } from "../../decision-engine/remoteBook.js";
import { AuthorDeletedEvent } from "../../books/events.js";
import type { Author, Book } from "../../books/models.js";
import type { DownloadFailedEvent } from "../../download-tracking/events.js";

function fakeRepository(overrides: Partial<IBlocklistRepository> = {}): IBlocklistRepository {
  return {
    all: vi.fn(() => []),
    find: vi.fn(),
    get: vi.fn(),
    insert: vi.fn((m: Blocklist) => ({ ...m, id: 1 })),
    delete: vi.fn(),
    deleteMany: vi.fn(),
    purge: vi.fn(),
    getPaged: vi.fn(),
    blocklistedByTitle: vi.fn(() => []),
    blocklistedByTorrentInfoHash: vi.fn(() => []),
    blocklistedByAuthor: vi.fn(() => []),
    ...overrides,
  };
}

function usenetRelease(overrides: Partial<ReleaseInfo> = {}): ReleaseInfo {
  return {
    guid: "guid-1",
    title: "Some Author - Some Book",
    size: 1000,
    downloadUrl: "http://example.com/x",
    indexerId: 1,
    indexer: "MyIndexer",
    indexerPriority: 1,
    downloadProtocol: DownloadProtocol.Usenet,
    publishDate: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function torrentRelease(overrides: Partial<TorrentInfo> = {}): TorrentInfo {
  return {
    ...usenetRelease(),
    downloadProtocol: DownloadProtocol.Torrent,
    seeders: 5,
    peers: 2,
    infoHash: "abc123",
    ...overrides,
  };
}

describe("BlocklistService", () => {
  describe("blocklisted() -- usenet", () => {
    it("returns true when a blocklisted item shares the exact PublishedDate", () => {
      const repo = fakeRepository({
        blocklistedByTitle: vi.fn(() => [
          newBlocklist({
            protocol: DownloadProtocol.Usenet,
            quality: newQualityModel(),
            publishedDate: "2026-01-01T00:00:00.000Z",
          }),
        ]),
      });
      const service = new BlocklistService(repo);

      expect(
        service.blocklisted(1, usenetRelease({ publishDate: "2026-01-01T00:00:00.000Z" }))
      ).toBe(true);
    });

    it("returns false when the release protocol doesn't match the blocklisted item's protocol", () => {
      const repo = fakeRepository({
        blocklistedByTitle: vi.fn(() => [
          newBlocklist({ protocol: DownloadProtocol.Torrent, quality: newQualityModel() }),
        ]),
      });
      const service = new BlocklistService(repo);

      expect(service.blocklisted(1, usenetRelease())).toBe(false);
    });

    it("matches within a 2-minute published-date window when indexer also matches (or is blank) and size is close", () => {
      const repo = fakeRepository({
        blocklistedByTitle: vi.fn(() => [
          newBlocklist({
            protocol: DownloadProtocol.Usenet,
            quality: newQualityModel(),
            publishedDate: "2026-01-01T00:00:00.000Z",
            size: 1000,
            indexer: "StoredIndexer",
          }),
        ]),
      });
      const service = new BlocklistService(repo);

      // Ported quirk (faithful to `SameNzb`'s `!HasSameIndexer(...) &&
      // HasSamePublishedDate(...) && HasSameSize(...)` -- see
      // blocklistService.ts's sameNzb): this fallback branch only matches
      // when the indexer is DIFFERENT from the stored one (the `!`), not
      // the same -- so a different indexer is required here to exercise the
      // true branch, not a matching or blank one.
      // 90 seconds later, well within the 2-minute window, and size close enough.
      expect(
        service.blocklisted(
          1,
          usenetRelease({
            publishDate: "2026-01-01T00:01:30.000Z",
            size: 1000,
            indexer: "DifferentIndexer",
          })
        )
      ).toBe(true);
    });

    it("does NOT match within the 2-minute window when the indexer is the same (faithfully preserved !HasSameIndexer quirk)", () => {
      const repo = fakeRepository({
        blocklistedByTitle: vi.fn(() => [
          newBlocklist({
            protocol: DownloadProtocol.Usenet,
            quality: newQualityModel(),
            publishedDate: "2026-01-01T00:00:00.000Z",
            size: 1000,
            indexer: "SameIndexer",
          }),
        ]),
      });
      const service = new BlocklistService(repo);

      expect(
        service.blocklisted(
          1,
          usenetRelease({
            publishDate: "2026-01-01T00:01:30.000Z",
            size: 1000,
            indexer: "SameIndexer",
          })
        )
      ).toBe(false);
    });
  });

  describe("blocklisted() -- torrent", () => {
    it("returns false for a plain (non-torrent) release under the Torrent protocol", () => {
      const repo = fakeRepository();
      const service = new BlocklistService(repo);

      expect(
        service.blocklisted(1, usenetRelease({ downloadProtocol: DownloadProtocol.Torrent }))
      ).toBe(false);
    });

    it("matches by info hash (case-insensitive) when the release has one", () => {
      const repo = fakeRepository({
        blocklistedByTorrentInfoHash: vi.fn(() => [
          newBlocklist({
            protocol: DownloadProtocol.Torrent,
            quality: newQualityModel(),
            torrentInfoHash: "ABC123",
          }),
        ]),
      });
      const service = new BlocklistService(repo);

      expect(service.blocklisted(1, torrentRelease({ infoHash: "abc123" }))).toBe(true);
    });

    it("falls back to indexer match when the release has no info hash", () => {
      const repo = fakeRepository({
        blocklistedByTitle: vi.fn(() => [
          newBlocklist({
            protocol: DownloadProtocol.Torrent,
            quality: newQualityModel(),
            indexer: "MyIndexer",
          }),
        ]),
      });
      const service = new BlocklistService(repo);

      expect(service.blocklisted(1, torrentRelease({ infoHash: null, indexer: "MyIndexer" }))).toBe(
        true
      );
    });
  });

  describe("blocklistedTorrentHash()", () => {
    it("matches case-insensitively", () => {
      const repo = fakeRepository({
        blocklistedByTorrentInfoHash: vi.fn(() => [
          newBlocklist({ quality: newQualityModel(), torrentInfoHash: "ABC123" }),
        ]),
      });
      const service = new BlocklistService(repo);

      expect(service.blocklistedTorrentHash(1, "abc123")).toBe(true);
    });
  });

  describe("block()", () => {
    it("inserts a Blocklist row derived from the RemoteBook, capturing torrentInfoHash for torrent releases", () => {
      const repo = fakeRepository();
      const service = new BlocklistService(repo);

      const remoteBook: RemoteBook = {
        release: torrentRelease({ infoHash: "deadbeef" }),
        parsedBookInfo: { authorName: "A", quality: newQualityModel(), discography: false },
        author: { id: 42 } as never,
        books: [{ id: 7 } as Book, { id: 8 } as Book],
        downloadAllowed: true,
        customFormats: [],
        customFormatScore: 0,
        releaseSource: 0,
      };

      service.block(remoteBook, "blocked for testing");

      expect(repo.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          authorId: 42,
          bookIds: [7, 8],
          message: "blocked for testing",
          torrentInfoHash: "deadbeef",
        })
      );
    });
  });

  describe("handleDownloadFailed()", () => {
    it("throws when Data is missing 'publishedDate' (faithfully preserved C# DateTime.Parse(null) crash)", () => {
      const repo = fakeRepository();
      const service = new BlocklistService(repo);

      const message: DownloadFailedEvent = {
        authorId: 1,
        bookIds: [1],
        quality: newQualityModel(),
        sourceTitle: "x",
        downloadClient: null,
        downloadId: null,
        message: "failed",
        data: {},
        trackedDownload: null,
        skipRedownload: false,
        releaseSource: 0,
      };

      expect(() => service.handleDownloadFailed(message)).toThrow();
      expect(repo.insert).not.toHaveBeenCalled();
    });

    it("inserts a Blocklist row when Data has publishedDate, defaulting size to 0 when absent", () => {
      const repo = fakeRepository();
      const service = new BlocklistService(repo);

      const message: DownloadFailedEvent = {
        authorId: 1,
        bookIds: [1, 2],
        quality: newQualityModel(),
        sourceTitle: "x",
        downloadClient: null,
        downloadId: null,
        message: "failed",
        data: { publishedDate: "2026-01-01T00:00:00.000Z", indexer: "MyIndexer", protocol: "2" },
        trackedDownload: null,
        skipRedownload: false,
        releaseSource: 0,
      };

      service.handleDownloadFailed(message);

      expect(repo.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          authorId: 1,
          bookIds: [1, 2],
          size: 0,
          indexer: "MyIndexer",
          protocol: 2,
          message: "failed",
        })
      );
    });

    it("parses a numeric indexerFlags string onto the inserted row", () => {
      const repo = fakeRepository();
      const service = new BlocklistService(repo);

      service.handleDownloadFailed({
        authorId: 1,
        bookIds: [1],
        quality: newQualityModel(),
        sourceTitle: "x",
        downloadClient: null,
        downloadId: null,
        message: "failed",
        data: { publishedDate: "2026-01-01T00:00:00.000Z", indexerFlags: "3" },
        trackedDownload: null,
        skipRedownload: false,
        releaseSource: 0,
      });

      expect(repo.insert).toHaveBeenCalledWith(expect.objectContaining({ indexerFlags: 3 }));
    });

    it("leaves indexerFlags at default when the value is missing", () => {
      const repo = fakeRepository();
      const service = new BlocklistService(repo);

      service.handleDownloadFailed({
        authorId: 1,
        bookIds: [1],
        quality: newQualityModel(),
        sourceTitle: "x",
        downloadClient: null,
        downloadId: null,
        message: "failed",
        data: { publishedDate: "2026-01-01T00:00:00.000Z" },
        trackedDownload: null,
        skipRedownload: false,
        releaseSource: 0,
      });

      expect(repo.insert).toHaveBeenCalledWith(expect.objectContaining({ indexerFlags: 0 }));
    });
  });

  describe("handleAuthorDeleted()", () => {
    it("deletes every blocklist row for that author", () => {
      const blocklisted = [newBlocklist({ authorId: 9, quality: newQualityModel() })];
      const repo = fakeRepository({ blocklistedByAuthor: vi.fn(() => blocklisted) });
      const service = new BlocklistService(repo);

      service.handleAuthorDeleted(new AuthorDeletedEvent({ id: 9 } as Author, false, false));

      expect(repo.blocklistedByAuthor).toHaveBeenCalledWith(9);
      expect(repo.deleteMany).toHaveBeenCalledWith(blocklisted);
    });
  });

  describe("execute()/delete()/deleteMany()", () => {
    it("execute() purges the repository", () => {
      const repo = fakeRepository();
      const service = new BlocklistService(repo);

      service.execute({} as never);

      expect(repo.purge).toHaveBeenCalled();
    });

    it("delete()/deleteMany() delegate to the repository", () => {
      const repo = fakeRepository();
      const service = new BlocklistService(repo);

      service.delete(5);
      service.deleteMany([1, 2, 3]);

      expect(repo.delete).toHaveBeenCalledWith(5);
      expect(repo.deleteMany).toHaveBeenCalledWith([1, 2, 3]);
    });
  });
});

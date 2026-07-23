import { describe, expect, it, vi } from "vitest";
import { HistoryService } from "../historyService.js";
import type { IHistoryRepository } from "../historyRepository.js";
import { newEntityHistory, EntityHistoryEventType, type EntityHistory } from "../entityHistory.js";
import { newQualityModel } from "../../qualities/qualityModel.js";
import { AuthorDeletedEvent } from "../../books/events.js";
import type { Author, Book } from "../../books/models.js";
import { DeleteMediaFileReason } from "../../media-files-import/deleteMediaFileReason.js";
import type { BookFileDeletedEvent, TrackImportedEvent } from "../../media-files-import/events.js";
import type { DownloadFailedEvent, DownloadIgnoredEvent } from "../../download-tracking/events.js";
import { BookGrabbedEvent } from "../../download-tracking/bookGrabbedEvent.js";
import { DownloadProtocol } from "../../indexers/DownloadProtocol.js";
import type { RemoteBook } from "../../decision-engine/remoteBook.js";

function fakeRepository(overrides: Partial<IHistoryRepository> = {}): IHistoryRepository {
  return {
    all: vi.fn(() => []),
    find: vi.fn(),
    get: vi.fn(),
    insert: vi.fn((m: EntityHistory) => ({ ...m, id: 1 })),
    insertMany: vi.fn((models: EntityHistory[]) => models.map((m) => ({ ...m, id: 1 }))),
    updateMany: vi.fn(),
    getPaged: vi.fn(),
    mostRecentForBook: vi.fn(),
    mostRecentForDownloadId: vi.fn(),
    findByDownloadId: vi.fn(() => []),
    getByAuthor: vi.fn(() => []),
    getByBook: vi.fn(() => []),
    findDownloadHistory: vi.fn(() => []),
    deleteForAuthor: vi.fn(),
    since: vi.fn(() => []),
    ...overrides,
  };
}

function grabbedRemoteBook(overrides: Partial<RemoteBook> = {}): RemoteBook {
  return {
    release: {
      guid: "g1",
      title: "Some Author - Some Book",
      size: 1000,
      downloadUrl: "http://x",
      indexerId: 1,
      indexer: "MyIndexer",
      indexerPriority: 1,
      downloadProtocol: DownloadProtocol.Usenet,
      publishDate: new Date().toISOString(),
      infoUrl: "http://info",
    },
    parsedBookInfo: {
      authorName: "A",
      quality: newQualityModel(),
      discography: false,
      releaseGroup: "GRP",
    },
    author: { id: 42 } as never,
    books: [{ id: 7, author: { id: 42 } } as unknown as Book],
    downloadAllowed: true,
    customFormats: [],
    customFormatScore: 5,
    releaseSource: 0,
    ...overrides,
  };
}

describe("HistoryService", () => {
  describe("simple delegating reads", () => {
    it("delegates paged/mostRecentForBook/get/getByAuthor/getByBook/since/updateMany to the repository", () => {
      const repo = fakeRepository();
      const service = new HistoryService(repo);

      service.paged({} as never);
      service.mostRecentForBook(1);
      service.mostRecentForDownloadId("x");
      service.get(1);
      service.getByAuthor(1, null);
      service.getByBook(1, null);
      service.since("2026-01-01", null);
      service.updateMany([]);

      expect(repo.getPaged).toHaveBeenCalled();
      expect(repo.mostRecentForBook).toHaveBeenCalledWith(1);
      expect(repo.mostRecentForDownloadId).toHaveBeenCalledWith("x");
      expect(repo.get).toHaveBeenCalledWith(1);
      expect(repo.getByAuthor).toHaveBeenCalledWith(1, null);
      expect(repo.getByBook).toHaveBeenCalledWith(1, null);
      expect(repo.since).toHaveBeenCalledWith("2026-01-01", null);
      expect(repo.updateMany).toHaveBeenCalledWith([]);
    });

    it("find() filters findByDownloadId results by eventType", () => {
      const repo = fakeRepository({
        findByDownloadId: vi.fn(() => [
          newEntityHistory({
            eventType: EntityHistoryEventType.Grabbed,
            quality: newQualityModel(),
          }),
          newEntityHistory({
            eventType: EntityHistoryEventType.DownloadFailed,
            quality: newQualityModel(),
          }),
        ]),
      });
      const service = new HistoryService(repo);

      const results = service.find("x", EntityHistoryEventType.Grabbed);
      expect(results).toHaveLength(1);
      expect(results[0]?.eventType).toBe(EntityHistoryEventType.Grabbed);
    });
  });

  describe("handleBookGrabbed()", () => {
    it("inserts one history row per book with derived Data fields", () => {
      const repo = fakeRepository();
      const service = new HistoryService(repo);

      const message = new BookGrabbedEvent(grabbedRemoteBook());
      message.downloadId = "dl-1";
      message.downloadClient = "sab";
      message.downloadClientName = "SABnzbd";

      service.handleBookGrabbed(message);

      expect(repo.insert).toHaveBeenCalledTimes(1);
      const inserted = (repo.insert as ReturnType<typeof vi.fn>).mock.calls[0][0] as EntityHistory;
      expect(inserted.eventType).toBe(EntityHistoryEventType.Grabbed);
      expect(inserted.authorId).toBe(42);
      expect(inserted.bookId).toBe(7);
      expect(inserted.downloadId).toBe("dl-1");
      expect(inserted.data["Indexer"]).toBe("MyIndexer");
      expect(inserted.data["DownloadClient"]).toBe("sab");
      expect(inserted.data["ReleaseGroup"]).toBe("GRP");
      expect(inserted.data["IndexerFlags"]).toBe("0");
    });

    it("derives authorId as 0 when the book has no populated author relation (Book.AuthorId compat getter)", () => {
      const repo = fakeRepository();
      const service = new HistoryService(repo);

      const message = new BookGrabbedEvent(
        grabbedRemoteBook({ books: [{ id: 9 } as unknown as Book] })
      );

      service.handleBookGrabbed(message);

      const inserted = (repo.insert as ReturnType<typeof vi.fn>).mock.calls[0][0] as EntityHistory;
      expect(inserted.authorId).toBe(0);
    });
  });

  describe("handleTrackImported()", () => {
    it("returns early when newDownload is false", () => {
      const repo = fakeRepository();
      const service = new HistoryService(repo);

      const message: TrackImportedEvent = {
        trackInfo: {},
        importedTrack: {
          id: 1,
          path: "/x.epub",
          quality: newQualityModel(),
          size: 10,
          indexerFlags: 0,
          releaseGroup: null,
          sceneName: null,
        },
        newDownload: false,
        downloadClientItem: null,
      };

      service.handleTrackImported(message, 1, 2);

      expect(repo.insert).not.toHaveBeenCalled();
    });

    it("inserts a BookFileImported row using the provided downloadClientItem's downloadId when present", () => {
      const repo = fakeRepository();
      const service = new HistoryService(repo);

      const message: TrackImportedEvent = {
        trackInfo: {},
        importedTrack: {
          id: 5,
          path: "/x.epub",
          quality: newQualityModel(),
          size: 100,
          indexerFlags: 0,
          releaseGroup: "GRP",
          sceneName: "Scene Name",
        },
        newDownload: true,
        downloadClientItem: { downloadId: "dl-9" },
      };

      service.handleTrackImported(message, 1, 2);

      const inserted = (repo.insert as ReturnType<typeof vi.fn>).mock.calls[0][0] as EntityHistory;
      expect(inserted.eventType).toBe(EntityHistoryEventType.BookFileImported);
      expect(inserted.authorId).toBe(1);
      expect(inserted.bookId).toBe(2);
      expect(inserted.downloadId).toBe("dl-9");
      expect(inserted.sourceTitle).toBe("Scene Name");
      expect(repo.findDownloadHistory).not.toHaveBeenCalled();
    });

    it("falls back to findDownloadId() when downloadClientItem has no downloadId", () => {
      const repo = fakeRepository({
        findDownloadHistory: vi.fn(() => [
          newEntityHistory({
            bookId: 2,
            eventType: EntityHistoryEventType.Grabbed,
            quality: newQualityModel(),
            downloadId: "found-id",
          }),
        ]),
      });
      const service = new HistoryService(repo);

      const message: TrackImportedEvent = {
        trackInfo: {},
        importedTrack: {
          id: 5,
          path: "/x.epub",
          quality: newQualityModel(),
          size: 100,
          indexerFlags: 0,
          releaseGroup: null,
          sceneName: null,
        },
        newDownload: true,
        downloadClientItem: null,
      };

      service.handleTrackImported(message, 1, 2);

      expect(repo.findDownloadHistory).toHaveBeenCalledWith(1, message.importedTrack.quality);
      const inserted = (repo.insert as ReturnType<typeof vi.fn>).mock.calls[0][0] as EntityHistory;
      expect(inserted.downloadId).toBe("found-id");
    });
  });

  describe("handleDownloadFailed()", () => {
    it("inserts one row per bookId", () => {
      const repo = fakeRepository();
      const service = new HistoryService(repo);

      const message: DownloadFailedEvent = {
        authorId: 1,
        bookIds: [10, 20],
        quality: newQualityModel(),
        sourceTitle: "x",
        downloadClient: "sab",
        downloadId: "dl-1",
        message: "failed",
        data: {},
        trackedDownload: null,
        skipRedownload: false,
        releaseSource: 0,
      };

      service.handleDownloadFailed(message);

      expect(repo.insert).toHaveBeenCalledTimes(2);
    });
  });

  describe("handleBookFileDeleted()", () => {
    it("skips insertion for NoLinkedEpisodes and ManualOverride reasons", () => {
      const repo = fakeRepository();
      const service = new HistoryService(repo);

      const base = {
        bookFile: { path: "/x", quality: newQualityModel(), indexerFlags: 0, releaseGroup: null },
      } as unknown as BookFileDeletedEvent;

      service.handleBookFileDeleted({ ...base, reason: DeleteMediaFileReason.NoLinkedEpisodes });
      service.handleBookFileDeleted({ ...base, reason: DeleteMediaFileReason.ManualOverride });

      expect(repo.insert).not.toHaveBeenCalled();
    });

    it("inserts a BookFileDeleted row for other reasons", () => {
      const repo = fakeRepository();
      const service = new HistoryService(repo);

      const message = {
        bookFile: {
          path: "/x",
          quality: newQualityModel(),
          indexerFlags: 0,
          releaseGroup: "GRP",
          author: { id: 3 },
          edition: { bookId: 4 },
        },
        reason: DeleteMediaFileReason.Upgrade,
      } as unknown as BookFileDeletedEvent;

      service.handleBookFileDeleted(message);

      const inserted = (repo.insert as ReturnType<typeof vi.fn>).mock.calls[0][0] as EntityHistory;
      expect(inserted.eventType).toBe(EntityHistoryEventType.BookFileDeleted);
      expect(inserted.authorId).toBe(3);
      expect(inserted.bookId).toBe(4);
      expect(inserted.data["Reason"]).toBe(DeleteMediaFileReason.Upgrade);
    });
  });

  describe("handleAuthorDeleted()", () => {
    it("deletes all history for the author", () => {
      const repo = fakeRepository();
      const service = new HistoryService(repo);

      service.handleAuthorDeleted(new AuthorDeletedEvent({ id: 7 } as Author, false, false));

      expect(repo.deleteForAuthor).toHaveBeenCalledWith(7);
    });
  });

  describe("handleDownloadIgnored()", () => {
    it("batch-inserts one row per bookId via insertMany", () => {
      const repo = fakeRepository();
      const service = new HistoryService(repo);

      const message: DownloadIgnoredEvent = {
        authorId: 1,
        bookIds: [1, 2, 3],
        quality: newQualityModel(),
        sourceTitle: "x",
        downloadClientInfo: null,
        downloadId: "dl-1",
        message: "ignored",
        trackedDownload: null,
      };

      service.handleDownloadIgnored(message);

      expect(repo.insertMany).toHaveBeenCalledTimes(1);
      const inserted = (repo.insertMany as ReturnType<typeof vi.fn>).mock
        .calls[0][0] as EntityHistory[];
      expect(inserted).toHaveLength(3);
      expect(inserted.every((h) => h.eventType === EntityHistoryEventType.DownloadIgnored)).toBe(
        true
      );
    });
  });

  describe("findDownloadId()", () => {
    it("returns null when there are multiple still-downloading Grabbed rows for different books", () => {
      const repo = fakeRepository({
        findDownloadHistory: vi.fn(() => [
          newEntityHistory({
            bookId: 1,
            eventType: EntityHistoryEventType.Grabbed,
            quality: newQualityModel(),
            downloadId: "a",
          }),
        ]),
      });
      const service = new HistoryService(repo);

      // bookId requested (2) doesn't match the only still-downloading row's bookId (1).
      expect(service.findDownloadId({} as never, 1, 2, newQualityModel())).toBeNull();
    });

    it("returns the matching downloadId when exactly one still-downloading row matches the book", () => {
      const repo = fakeRepository({
        findDownloadHistory: vi.fn(() => [
          newEntityHistory({
            bookId: 5,
            eventType: EntityHistoryEventType.Grabbed,
            quality: newQualityModel(),
            downloadId: "match",
          }),
        ]),
      });
      const service = new HistoryService(repo);

      expect(service.findDownloadId({} as never, 1, 5, newQualityModel())).toBe("match");
    });

    it("returns null when no history rows exist for the book at all (no still-downloading rows -> downloadId stays null)", () => {
      const repo = fakeRepository({ findDownloadHistory: vi.fn(() => []) });
      const service = new HistoryService(repo);

      expect(service.findDownloadId({} as never, 1, 5, newQualityModel())).toBeNull();
    });
  });
});

import { beforeEach, describe, expect, it } from "vitest";
import { createMainDatabase, type MainDatabase } from "../../../db/db-factory.js";
import { DownloadHistoryRepository } from "../downloadHistoryRepository.js";
import { DownloadHistoryEventType } from "../downloadHistory.js";
import { DownloadHistoryService } from "../downloadHistoryService.js";
import type { HistoryServiceLike } from "../../entityHistory.js";
import { DownloadProtocol } from "../../../indexers/DownloadProtocol.js";
import { newRemoteBook } from "../../../decision-engine/remoteBook.js";
import { BookGrabbedEvent } from "../../bookGrabbedEvent.js";
import { DownloadCompletedEvent, DownloadFailedEvent, DownloadIgnoredEvent } from "../../events.js";
import { TrackedDownload, TrackedDownloadState } from "../../tracked-downloads/trackedDownload.js";
import type { AuthorDeletedEvent } from "../../../books/events.js";
import { OsPath } from "../../../download-clients/OsPath.js";

function stubHistoryService(): HistoryServiceLike {
  return {
    mostRecentForDownloadId: () => null,
    get: () => {
      throw new Error("not used in these tests");
    },
    find: () => [],
    findByDownloadId: () => [],
  };
}

describe("DownloadHistoryService", () => {
  let db: MainDatabase;
  let repo: DownloadHistoryRepository;
  let service: DownloadHistoryService;

  beforeEach(() => {
    db = createMainDatabase(":memory:");
    repo = new DownloadHistoryRepository(db);
    service = new DownloadHistoryService(repo, stubHistoryService());
  });

  describe("downloadAlreadyImported()", () => {
    it("returns false when there is no history for the download id", () => {
      expect(service.downloadAlreadyImported("missing")).toBe(false);
    });

    it("returns true when the most recent event (by date) is DownloadImported", () => {
      repo.insert({
        id: 0,
        eventType: DownloadHistoryEventType.DownloadGrabbed,
        authorId: 1,
        downloadId: "x",
        sourceTitle: "t",
        date: "2026-01-01T00:00:00.000Z",
        protocol: null,
        indexerId: null,
        downloadClientId: null,
        release: null,
        data: {},
      });
      repo.insert({
        id: 0,
        eventType: DownloadHistoryEventType.DownloadImported,
        authorId: 1,
        downloadId: "x",
        sourceTitle: "t",
        date: "2026-01-02T00:00:00.000Z",
        protocol: null,
        indexerId: null,
        downloadClientId: null,
        release: null,
        data: {},
      });

      expect(service.downloadAlreadyImported("x")).toBe(true);
    });

    it("returns false when a Grabbed event is more recent than the Imported event (re-grabbed since)", () => {
      repo.insert({
        id: 0,
        eventType: DownloadHistoryEventType.DownloadImported,
        authorId: 1,
        downloadId: "x",
        sourceTitle: "t",
        date: "2026-01-01T00:00:00.000Z",
        protocol: null,
        indexerId: null,
        downloadClientId: null,
        release: null,
        data: {},
      });
      repo.insert({
        id: 0,
        eventType: DownloadHistoryEventType.DownloadGrabbed,
        authorId: 1,
        downloadId: "x",
        sourceTitle: "t",
        date: "2026-01-02T00:00:00.000Z",
        protocol: null,
        indexerId: null,
        downloadClientId: null,
        release: null,
        data: {},
      });

      expect(service.downloadAlreadyImported("x")).toBe(false);
    });
  });

  describe("getLatestDownloadHistoryItem()", () => {
    it("returns undefined when there is no history", () => {
      expect(service.getLatestDownloadHistoryItem("missing")).toBeUndefined();
    });

    it("returns the most recent 'expected' event type", () => {
      repo.insert({
        id: 0,
        eventType: DownloadHistoryEventType.DownloadGrabbed,
        authorId: 1,
        downloadId: "x",
        sourceTitle: "t",
        date: "2026-01-01T00:00:00.000Z",
        protocol: null,
        indexerId: null,
        downloadClientId: null,
        release: null,
        data: {},
      });
      repo.insert({
        id: 0,
        eventType: DownloadHistoryEventType.DownloadFailed,
        authorId: 1,
        downloadId: "x",
        sourceTitle: "t",
        date: "2026-01-02T00:00:00.000Z",
        protocol: null,
        indexerId: null,
        downloadClientId: null,
        release: null,
        data: {},
      });

      expect(service.getLatestDownloadHistoryItem("x")?.eventType).toBe(
        DownloadHistoryEventType.DownloadFailed
      );
    });
  });

  describe("getLatestGrab()", () => {
    it("returns the most recent DownloadGrabbed event for the download id", () => {
      repo.insert({
        id: 0,
        eventType: DownloadHistoryEventType.DownloadGrabbed,
        authorId: 1,
        downloadId: "x",
        sourceTitle: "old",
        date: "2026-01-01T00:00:00.000Z",
        protocol: null,
        indexerId: null,
        downloadClientId: null,
        release: null,
        data: {},
      });
      repo.insert({
        id: 0,
        eventType: DownloadHistoryEventType.DownloadGrabbed,
        authorId: 1,
        downloadId: "x",
        sourceTitle: "new",
        date: "2026-01-02T00:00:00.000Z",
        protocol: null,
        indexerId: null,
        downloadClientId: null,
        release: null,
        data: {},
      });

      expect(service.getLatestGrab("x")?.sourceTitle).toBe("new");
    });

    it("returns undefined when there's no grab event", () => {
      expect(service.getLatestGrab("missing")).toBeUndefined();
    });
  });

  describe("handleBookGrabbed()", () => {
    it("skips downloads with no download id", () => {
      const remoteBook = newRemoteBook({
        author: { id: 5, tags: new Set() } as never,
        release: {
          title: "t",
          downloadProtocol: DownloadProtocol.Usenet,
          indexerId: 1,
          indexer: "idx",
        } as never,
        books: [],
      });
      const event = new BookGrabbedEvent(remoteBook);
      event.downloadId = null;

      service.handleBookGrabbed(event);

      expect(repo.all()).toHaveLength(0);
    });

    it("inserts a DownloadGrabbed history row for a valid grab", () => {
      const remoteBook = newRemoteBook({
        author: { id: 5, tags: new Set() } as never,
        release: {
          title: "Some Title",
          downloadProtocol: DownloadProtocol.Torrent,
          indexerId: 1,
          indexer: "MyIndexer",
        } as never,
        books: [],
        customFormatScore: 10,
      });
      const event = new BookGrabbedEvent(remoteBook);
      event.downloadId = "abc123";
      event.downloadClient = "qbit";
      event.downloadClientId = 3;
      event.downloadClientName = "QBittorrent";

      service.handleBookGrabbed(event);

      const stored = repo.findByDownloadId("abc123");
      expect(stored).toHaveLength(1);
      expect(stored[0]?.eventType).toBe(DownloadHistoryEventType.DownloadGrabbed);
      expect(stored[0]?.authorId).toBe(5);
      expect(stored[0]?.sourceTitle).toBe("Some Title");
      expect(stored[0]?.data.DownloadClient).toBe("qbit");
      expect(stored[0]?.data.DownloadClientName).toBe("QBittorrent");
      expect(stored[0]?.data.CustomFormatScore).toBe("10");
    });
  });

  describe("handleDownloadCompleted()", () => {
    it("inserts a DownloadImported history row", () => {
      const trackedDownload = new TrackedDownload();
      trackedDownload.downloadClient = 2;
      trackedDownload.protocol = DownloadProtocol.Usenet;
      trackedDownload.downloadItem = {
        downloadClientInfo: {
          protocol: DownloadProtocol.Usenet,
          type: "Sabnzbd",
          id: 2,
          name: "SAB",
          hasPostImportCategory: false,
        },
        downloadId: "dl-1",
        category: null,
        title: "Some Download",
        totalSize: 0,
        remainingSize: 0,
        remainingTime: null,
        seedRatio: null,
        outputPath: new OsPath("/downloads/some"),
        message: null,
        status: 3,
        isEncrypted: false,
        canMoveFiles: true,
        canBeRemoved: true,
        removed: false,
      };

      const event = new DownloadCompletedEvent(trackedDownload, 7);
      service.handleDownloadCompleted(event);

      const stored = repo.findByDownloadId("dl-1");
      expect(stored).toHaveLength(1);
      expect(stored[0]?.eventType).toBe(DownloadHistoryEventType.DownloadImported);
      expect(stored[0]?.authorId).toBe(7);
    });
  });

  describe("handleDownloadFailed()", () => {
    it("does nothing when trackedDownload is null (unknown download)", () => {
      const event = new DownloadFailedEvent();
      event.trackedDownload = null;

      service.handleDownloadFailed(event);

      expect(repo.all()).toHaveLength(0);
    });
  });

  describe("handleDownloadIgnored()", () => {
    it("inserts a DownloadIgnored history row", () => {
      const event = new DownloadIgnoredEvent();
      event.authorId = 9;
      event.bookIds = [1, 2];
      event.sourceTitle = "Ignored Title";
      event.downloadId = "ignored-1";
      event.downloadClientInfo = {
        protocol: DownloadProtocol.Torrent,
        type: "QBittorrent",
        id: 4,
        name: "QBit",
        hasPostImportCategory: false,
      };

      service.handleDownloadIgnored(event);

      const stored = repo.findByDownloadId("ignored-1");
      expect(stored).toHaveLength(1);
      expect(stored[0]?.eventType).toBe(DownloadHistoryEventType.DownloadIgnored);
      expect(stored[0]?.authorId).toBe(9);
    });
  });

  describe("handleAuthorDeleted()", () => {
    it("deletes all history rows for that author", () => {
      repo.insert({
        id: 0,
        eventType: DownloadHistoryEventType.DownloadGrabbed,
        authorId: 3,
        downloadId: "a",
        sourceTitle: "t",
        date: "2026-01-01T00:00:00.000Z",
        protocol: null,
        indexerId: null,
        downloadClientId: null,
        release: null,
        data: {},
      });

      const event = { author: { id: 3 } } as AuthorDeletedEvent;
      service.handleAuthorDeleted(event);

      expect(repo.all()).toHaveLength(0);
    });
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { TrackedDownloadService } from "../trackedDownloadService.js";
import { TrackedDownloadState } from "../trackedDownload.js";
import type { ParsingService } from "../../../parser/parsingService.js";
import type { HistoryServiceLike } from "../../entityHistory.js";
import type { IDownloadHistoryService } from "../../history/downloadHistoryService.js";
import { newRemoteBook } from "../../../parser/model/remoteBook.js";
import { newBook, newAuthor } from "../../../books/models.js";
import { DownloadProtocol } from "../../../indexers/DownloadProtocol.js";
import type { DownloadClientDefinition, DownloadClientItem } from "../../downloadClients.js";
import { DownloadItemStatus } from "../../downloadClients.js";
import { OsPath } from "../../../download-clients/OsPath.js";
import type { BookInfoRefreshedEvent } from "../../../books/events.js";

/** Ported from NzbDrone.Core.Test/Download/TrackedDownloads/TrackedDownloadServiceFixture.cs (translated scenarios). */
describe("TrackedDownloadService", () => {
  let parsingService: ParsingService;
  let historyService: HistoryServiceLike;
  let downloadHistoryService: IDownloadHistoryService;
  let subject: TrackedDownloadService;

  const client: DownloadClientDefinition = {
    id: 1,
    name: "Test Client",
    implementation: "QBittorrent",
    configContract: null,
    settings: null,
    tags: [],
    enable: true,
    protocol: DownloadProtocol.Torrent,
    priority: 1,
    removeCompletedDownloads: true,
    removeFailedDownloads: true,
  };

  function makeItem(overrides: Partial<DownloadClientItem> = {}): DownloadClientItem {
    return {
      downloadClientInfo: {
        protocol: client.protocol,
        type: "Torrent",
        id: client.id,
        name: client.name,
        hasPostImportCategory: false,
      },
      downloadId: "35238",
      category: null,
      title: "The torrent release folder",
      totalSize: 0,
      remainingSize: 0,
      remainingTime: null,
      seedRatio: null,
      outputPath: OsPath.empty(),
      message: null,
      status: DownloadItemStatus.Downloading,
      isEncrypted: false,
      canMoveFiles: true,
      canBeRemoved: true,
      removed: false,
      ...overrides,
    };
  }

  beforeEach(() => {
    parsingService = {
      map: vi.fn(),
      mapByIds: vi.fn(),
    } as unknown as ParsingService;

    historyService = {
      mostRecentForDownloadId: () => null,
      get: () => {
        throw new Error("not used");
      },
      find: () => [],
      findByDownloadId: () => [],
    };

    downloadHistoryService = {
      downloadAlreadyImported: () => false,
      getLatestDownloadHistoryItem: () => undefined,
      getLatestGrab: () => undefined,
    };

    subject = new TrackedDownloadService(parsingService, historyService, downloadHistoryService, {
      parseCustomFormatForRemoteBook: () => [],
    });
  });

  it("should_track_downloads_using_the_source_title_if_it_cannot_be_found_using_the_download_title", () => {
    const author = { ...newAuthor(), id: 5 };
    const book = { ...newBook(), id: 4 };
    const remoteBook = { ...newRemoteBook(), author, books: [book] };

    historyService.findByDownloadId = (downloadId) =>
      downloadId === "35238"
        ? [
            {
              id: 1,
              bookId: 4,
              authorId: 5,
              sourceTitle: "Audio Author - Audio Book [2018 - FLAC]",
              quality: {} as never,
              date: new Date().toISOString(),
              eventType: 1,
              data: {},
              downloadId: "35238",
            },
          ]
        : [];

    // The title itself won't parse (no author/book match), but the
    // fallback re-parse of the first history item's sourceTitle should.
    (parsingService.mapByIds as ReturnType<typeof vi.fn>).mockReturnValue(remoteBook);

    const item = makeItem();
    const tracked = subject.trackDownload(client, item);

    expect(tracked).not.toBeNull();
    // Since "The torrent release folder" doesn't parse via parseBookTitle,
    // and history exists, TrackedDownloadService falls back to
    // ParsingService.mapByIds using the first history item's author/book ids.
    expect(tracked!.remoteBook).toEqual(remoteBook);
  });

  it("caches by download id and returns the same instance on find()", () => {
    const item = makeItem();
    const tracked = subject.trackDownload(client, item);

    expect(subject.find("35238")).toBe(tracked);
  });

  it("re-tracking an existing non-downloading item just updates the download item", () => {
    const item = makeItem();
    const tracked = subject.trackDownload(client, item);
    tracked!.state = TrackedDownloadState.Imported;

    const updatedItem = makeItem({ title: "Updated Title" });
    const retracked = subject.trackDownload(client, updatedItem);

    expect(retracked).toBe(tracked);
    expect(retracked!.downloadItem.title).toBe("Updated Title");
    expect(retracked!.isTrackable).toBe(true);
  });

  it("getTrackedDownloads() returns every tracked item", () => {
    subject.trackDownload(client, makeItem({ downloadId: "a" }));
    subject.trackDownload(client, makeItem({ downloadId: "b" }));

    expect(subject.getTrackedDownloads()).toHaveLength(2);
  });

  it("stopTracking() removes the item from the cache", () => {
    subject.trackDownload(client, makeItem());
    subject.stopTracking("35238");

    expect(subject.find("35238")).toBeUndefined();
  });

  it("stopTrackingMany() removes multiple items", () => {
    subject.trackDownload(client, makeItem({ downloadId: "a" }));
    subject.trackDownload(client, makeItem({ downloadId: "b" }));

    subject.stopTrackingMany(["a", "b"]);

    expect(subject.getTrackedDownloads()).toHaveLength(0);
  });

  it("updateTrackable() marks items missing from the given list as untrackable", () => {
    const a = subject.trackDownload(client, makeItem({ downloadId: "a" }))!;
    const b = subject.trackDownload(client, makeItem({ downloadId: "b" }))!;

    subject.updateTrackable([a]);

    expect(a.isTrackable).toBe(true);
    expect(b.isTrackable).toBe(false);
  });

  it("returns null if an unexpected error occurs while tracking", () => {
    historyService.findByDownloadId = () => {
      throw new Error("boom");
    };

    expect(subject.trackDownload(client, makeItem())).toBeNull();
  });

  it("handleAuthorDeleted unmaps the tracked download's remoteBook when the author matches", () => {
    const author = { ...newAuthor(), id: 5 };
    const book = { ...newBook(), id: 4 };
    const remoteBook = { ...newRemoteBook(), author, books: [book] };

    (parsingService.mapByIds as ReturnType<typeof vi.fn>).mockReturnValue(remoteBook);
    historyService.findByDownloadId = () => [
      {
        id: 1,
        bookId: 4,
        authorId: 5,
        sourceTitle: "Audio Author - Audio Book [2018 - FLAC]",
        quality: {} as never,
        date: new Date().toISOString(),
        eventType: 1,
        data: {},
        downloadId: "35238",
      },
    ];

    const item = makeItem();
    const tracked = subject.trackDownload(client, item)!;
    expect(tracked.remoteBook).not.toBeNull();

    (parsingService.mapByIds as ReturnType<typeof vi.fn>).mockReturnValue(null);

    subject.handleAuthorDeleted({ author } as never);

    expect(subject.getTrackedDownloads()[0]?.remoteBook).toBeNull();
  });

  it("handleBookInfoRefreshed unmaps tracked downloads referencing a removed book", () => {
    const author = { ...newAuthor(), id: 5 };
    const book = { ...newBook(), id: 4 };
    const remoteBook = { ...newRemoteBook(), author, books: [book] };

    (parsingService.mapByIds as ReturnType<typeof vi.fn>).mockReturnValue(remoteBook);
    historyService.findByDownloadId = () => [
      {
        id: 1,
        bookId: 4,
        authorId: 5,
        sourceTitle: "Audio Author - Audio Book [2018 - FLAC]",
        quality: {} as never,
        date: new Date().toISOString(),
        eventType: 1,
        data: {},
        downloadId: "35238",
      },
    ];

    subject.trackDownload(client, makeItem());

    (parsingService.mapByIds as ReturnType<typeof vi.fn>).mockReturnValue(null);

    const event = { removed: [book] } as unknown as BookInfoRefreshedEvent;
    subject.handleBookInfoRefreshed(event);

    expect(subject.getTrackedDownloads()[0]?.remoteBook).toBeNull();
  });
});

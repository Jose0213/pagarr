import { describe, expect, it, vi } from "vitest";
import { QueueService, type QueueServiceEventAggregatorLike } from "../queueService.js";
import { QueueUpdatedEvent } from "../queueUpdatedEvent.js";
import type {
  HistoryServiceLike,
  EntityHistoryRecord,
} from "../../download-tracking/entityHistory.js";
import { EntityHistoryEventType } from "../../download-tracking/entityHistory.js";
import { newBook, newAuthor } from "../../books/models.js";
import { newRemoteBook } from "../../parser/model/remoteBook.js";
import { newParsedBookInfo } from "../../parser/model/parsedBookInfo.js";
import {
  TrackedDownload,
  TrackedDownloadState,
} from "../../download-tracking/tracked-downloads/trackedDownload.js";
import { TrackedDownloadRefreshedEvent } from "../../download-tracking/tracked-downloads/trackedDownloadRefreshedEvent.js";
import { createDownloadClientItem } from "../../download-clients/DownloadClientItem.js";
import { DownloadItemStatus } from "../../download-clients/DownloadItemStatus.js";
import { DownloadProtocol } from "../../indexers/DownloadProtocol.js";

/** Ported from NzbDrone.Core.Test/QueueTests/QueueServiceFixture.cs. */

function makeHistoryService(records: EntityHistoryRecord[] = []): HistoryServiceLike {
  return {
    mostRecentForDownloadId: () => null,
    get: (id: number) => {
      const found = records.find((r) => r.id === id);
      if (!found) {
        throw new Error("not found");
      }
      return found;
    },
    find: () => records,
    findByDownloadId: () => records,
  };
}

function makeTrackedDownload(): TrackedDownload {
  const author = { ...newAuthor(), id: 1 };
  const books = [1, 2, 3].map((id) => ({ ...newBook(), id, authorId: author.id }) as never);

  const remoteBook = {
    ...newRemoteBook(),
    author,
    books,
    parsedBookInfo: newParsedBookInfo(),
  };

  const trackedDownload = new TrackedDownload();
  trackedDownload.isTrackable = true;
  trackedDownload.downloadClient = 1;
  trackedDownload.protocol = DownloadProtocol.Torrent;
  trackedDownload.downloadItem = createDownloadClientItem({
    downloadId: "abc123",
    title: "Some Author - Some Book",
    remainingTime: 10_000,
    status: DownloadItemStatus.Downloading,
    downloadClientInfo: {
      protocol: DownloadProtocol.Torrent,
      type: "Torrent",
      id: 1,
      name: "Test Client",
      hasPostImportCategory: false,
    },
  });
  trackedDownload.remoteBook = remoteBook;

  return trackedDownload;
}

describe("QueueService", () => {
  it("queue_items_should_have_id", () => {
    const historyItem: EntityHistoryRecord = {
      id: 1,
      bookId: 0,
      authorId: 1,
      sourceTitle: "x",
      quality: {
        quality: { id: 0, name: "Unknown" },
        revision: { version: 1, real: 0, isRepack: false },
      },
      date: new Date().toISOString(),
      eventType: EntityHistoryEventType.Grabbed,
      data: {},
      downloadId: "abc123",
    };
    const historyService = makeHistoryService([historyItem]);
    const eventAggregator: QueueServiceEventAggregatorLike = { publishEvent: vi.fn() };
    const subject = new QueueService(eventAggregator, historyService);

    const trackedDownloads = [makeTrackedDownload()];

    subject.handle(new TrackedDownloadRefreshedEvent(trackedDownloads));

    const queue = subject.getQueue();

    expect(queue).toHaveLength(3);
    expect(queue.every((v) => v.id > 0)).toBe(true);

    const distinct = new Set(queue.map((v) => v.id));
    expect(distinct.size).toBe(3);
  });

  it("publishes QueueUpdatedEvent after handling a refresh", () => {
    const eventAggregator: QueueServiceEventAggregatorLike = { publishEvent: vi.fn() };
    const subject = new QueueService(eventAggregator, makeHistoryService());

    subject.handle(new TrackedDownloadRefreshedEvent([makeTrackedDownload()]));

    expect(eventAggregator.publishEvent).toHaveBeenCalledWith(expect.any(QueueUpdatedEvent));
  });

  it("excludes non-trackable downloads from the mapped queue", () => {
    const eventAggregator: QueueServiceEventAggregatorLike = { publishEvent: vi.fn() };
    const subject = new QueueService(eventAggregator, makeHistoryService());

    const notTrackable = makeTrackedDownload();
    notTrackable.isTrackable = false;

    subject.handle(new TrackedDownloadRefreshedEvent([notTrackable]));

    expect(subject.getQueue()).toHaveLength(0);
  });

  it("yields a single queue item (book: null) when remoteBook has no books", () => {
    const eventAggregator: QueueServiceEventAggregatorLike = { publishEvent: vi.fn() };
    const subject = new QueueService(eventAggregator, makeHistoryService());

    const trackedDownload = makeTrackedDownload();
    trackedDownload.remoteBook = { ...trackedDownload.remoteBook!, books: [] };

    subject.handle(new TrackedDownloadRefreshedEvent([trackedDownload]));

    const queue = subject.getQueue();
    expect(queue).toHaveLength(1);
    expect(queue[0]?.book).toBeNull();
  });

  it("sorts by remaining time ascending, with null (unknown) remaining time last", () => {
    const eventAggregator: QueueServiceEventAggregatorLike = { publishEvent: vi.fn() };
    const subject = new QueueService(eventAggregator, makeHistoryService());

    const slow = makeTrackedDownload();
    slow.remoteBook = { ...slow.remoteBook!, books: [] };
    slow.downloadItem = { ...slow.downloadItem, downloadId: "slow", remainingTime: 5000 };

    const unknown = makeTrackedDownload();
    unknown.remoteBook = { ...unknown.remoteBook!, books: [] };
    unknown.downloadItem = { ...unknown.downloadItem, downloadId: "unknown", remainingTime: null };

    const fast = makeTrackedDownload();
    fast.remoteBook = { ...fast.remoteBook!, books: [] };
    fast.downloadItem = { ...fast.downloadItem, downloadId: "fast", remainingTime: 1000 };

    subject.handle(new TrackedDownloadRefreshedEvent([slow, unknown, fast]));

    const queue = subject.getQueue();
    expect(queue.map((q) => q.downloadId)).toEqual(["fast", "slow", "unknown"]);
  });

  it("find/remove operate on the last-mapped queue", () => {
    const eventAggregator: QueueServiceEventAggregatorLike = { publishEvent: vi.fn() };
    const subject = new QueueService(eventAggregator, makeHistoryService());

    const trackedDownload = makeTrackedDownload();
    trackedDownload.remoteBook = { ...trackedDownload.remoteBook!, books: [] };
    subject.handle(new TrackedDownloadRefreshedEvent([trackedDownload]));

    const [item] = subject.getQueue();
    expect(item).toBeDefined();
    expect(subject.find(item!.id)).toBe(item);

    subject.remove(item!.id);

    expect(subject.find(item!.id)).toBeUndefined();
    expect(subject.getQueue()).toHaveLength(0);
  });

  it("computes estimatedCompletionTime from timeleft, leaves it null when timeleft is null", () => {
    const eventAggregator: QueueServiceEventAggregatorLike = { publishEvent: vi.fn() };
    const subject = new QueueService(eventAggregator, makeHistoryService());

    const trackedDownload = makeTrackedDownload();
    trackedDownload.remoteBook = { ...trackedDownload.remoteBook!, books: [] };
    trackedDownload.downloadItem = { ...trackedDownload.downloadItem, remainingTime: 60_000 };

    subject.handle(new TrackedDownloadRefreshedEvent([trackedDownload]));

    const [item] = subject.getQueue();
    expect(item?.timeleft).toBe(60_000);
    expect(item?.estimatedCompletionTime).not.toBeNull();

    const noTimeleft = makeTrackedDownload();
    noTimeleft.remoteBook = { ...noTimeleft.remoteBook!, books: [] };
    noTimeleft.downloadItem = { ...noTimeleft.downloadItem, remainingTime: null };

    subject.handle(new TrackedDownloadRefreshedEvent([noTimeleft]));

    const [item2] = subject.getQueue();
    expect(item2?.estimatedCompletionTime).toBeNull();
  });

  it("reads downloadForced from the most recent Grabbed history entry's data", () => {
    const grabbedWithForced: EntityHistoryRecord = {
      id: 1,
      bookId: 0,
      authorId: 1,
      sourceTitle: "x",
      quality: {
        quality: { id: 0, name: "Unknown" },
        revision: { version: 1, real: 0, isRepack: false },
      },
      date: new Date().toISOString(),
      eventType: EntityHistoryEventType.Grabbed,
      data: { downloadForced: "True" },
      downloadId: "abc123",
    };
    const eventAggregator: QueueServiceEventAggregatorLike = { publishEvent: vi.fn() };
    const subject = new QueueService(eventAggregator, makeHistoryService([grabbedWithForced]));

    const trackedDownload = makeTrackedDownload();
    trackedDownload.remoteBook = { ...trackedDownload.remoteBook!, books: [] };

    subject.handle(new TrackedDownloadRefreshedEvent([trackedDownload]));

    expect(subject.getQueue()[0]?.downloadForced).toBe(true);
  });

  it("defaults downloadForced to false when there is no matching history", () => {
    const eventAggregator: QueueServiceEventAggregatorLike = { publishEvent: vi.fn() };
    const subject = new QueueService(eventAggregator, makeHistoryService([]));

    const trackedDownload = makeTrackedDownload();
    trackedDownload.remoteBook = { ...trackedDownload.remoteBook!, books: [] };

    subject.handle(new TrackedDownloadRefreshedEvent([trackedDownload]));

    expect(subject.getQueue()[0]?.downloadForced).toBe(false);
  });

  it("falls back to Quality.Unknown when the tracked download has no parsed quality", () => {
    const eventAggregator: QueueServiceEventAggregatorLike = { publishEvent: vi.fn() };
    const subject = new QueueService(eventAggregator, makeHistoryService());

    const trackedDownload = makeTrackedDownload();
    trackedDownload.remoteBook = {
      ...trackedDownload.remoteBook!,
      books: [],
      parsedBookInfo: null,
    };

    subject.handle(new TrackedDownloadRefreshedEvent([trackedDownload]));

    // Quality.Unknown's display name is literally "Unknown Text" (matches
    // the real C# `new Quality(0, "Unknown Text")`) -- id 0 is what this
    // test actually cares about verifying the fallback landed correctly.
    expect(subject.getQueue()[0]?.quality.quality.id).toBe(0);
    expect(subject.getQueue()[0]?.quality.quality.name).toBe("Unknown Text");
  });

  it("maps state ImportPending downloads too (still trackable)", () => {
    const eventAggregator: QueueServiceEventAggregatorLike = { publishEvent: vi.fn() };
    const subject = new QueueService(eventAggregator, makeHistoryService());

    const trackedDownload = makeTrackedDownload();
    trackedDownload.remoteBook = { ...trackedDownload.remoteBook!, books: [] };
    trackedDownload.state = TrackedDownloadState.ImportPending;

    subject.handle(new TrackedDownloadRefreshedEvent([trackedDownload]));

    expect(subject.getQueue()[0]?.trackedDownloadState).toBe(TrackedDownloadState.ImportPending);
  });
});

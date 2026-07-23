import { describe, expect, it, vi } from "vitest";
import { IgnoredDownloadService } from "../ignoredDownloadService.js";
import { TrackedDownload } from "../tracked-downloads/trackedDownload.js";
import { newRemoteBook } from "../../parser/model/remoteBook.js";
import { newAuthor, newBook } from "../../books/models.js";
import { DownloadProtocol } from "../../indexers/DownloadProtocol.js";
import type { DownloadClientItem } from "../downloadClients.js";
import { OsPath } from "../../download-clients/OsPath.js";
import { DownloadIgnoredEvent } from "../events.js";

function makeItem(): DownloadClientItem {
  return {
    downloadClientInfo: {
      protocol: DownloadProtocol.Torrent,
      type: "T",
      id: 1,
      name: "Client",
      hasPostImportCategory: false,
    },
    downloadId: "dl-1",
    category: null,
    title: "Some Title",
    totalSize: 0,
    remainingSize: 0,
    remainingTime: null,
    seedRatio: null,
    outputPath: OsPath.empty(),
    message: null,
    status: 2,
    isEncrypted: false,
    canMoveFiles: true,
    canBeRemoved: true,
    removed: false,
  };
}

describe("IgnoredDownloadService", () => {
  it("publishes a DownloadIgnoredEvent and returns true when author + books are known", () => {
    const publishEvent = vi.fn();
    const service = new IgnoredDownloadService({ publishEvent });

    const trackedDownload = new TrackedDownload();
    trackedDownload.downloadItem = makeItem();
    trackedDownload.remoteBook = {
      ...newRemoteBook(),
      author: { ...newAuthor(), id: 5 },
      books: [
        { ...newBook(), id: 1 },
        { ...newBook(), id: 2 },
      ],
      parsedBookInfo: { authorName: "x", quality: {} as never, discography: false } as never,
    };

    const result = service.ignoreDownload(trackedDownload);

    expect(result).toBe(true);
    expect(publishEvent).toHaveBeenCalledTimes(1);
    const event = publishEvent.mock.calls[0]![0] as DownloadIgnoredEvent;
    expect(event.authorId).toBe(5);
    expect(event.bookIds).toEqual([1, 2]);
    expect(event.message).toBe("Manually ignored");
    expect(event.trackedDownload).toBe(trackedDownload);
  });

  it("returns false without publishing when author is unknown", () => {
    const publishEvent = vi.fn();
    const service = new IgnoredDownloadService({ publishEvent });

    const trackedDownload = new TrackedDownload();
    trackedDownload.downloadItem = makeItem();
    trackedDownload.remoteBook = { ...newRemoteBook(), author: null, books: [] };

    expect(service.ignoreDownload(trackedDownload)).toBe(false);
    expect(publishEvent).not.toHaveBeenCalled();
  });

  it("returns false without publishing when there are no books", () => {
    const publishEvent = vi.fn();
    const service = new IgnoredDownloadService({ publishEvent });

    const trackedDownload = new TrackedDownload();
    trackedDownload.downloadItem = makeItem();
    trackedDownload.remoteBook = {
      ...newRemoteBook(),
      author: { ...newAuthor(), id: 5 },
      books: [],
    };

    expect(service.ignoreDownload(trackedDownload)).toBe(false);
    expect(publishEvent).not.toHaveBeenCalled();
  });
});

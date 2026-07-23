import { beforeEach, describe, expect, it } from "vitest";
import { TrackedDownloadAlreadyImported } from "../trackedDownloadAlreadyImported.js";
import { TrackedDownload } from "../trackedDownload.js";
import { EntityHistoryEventType, type EntityHistoryRecord } from "../../entityHistory.js";
import { newRemoteBook } from "../../../parser/model/remoteBook.js";
import type { Book } from "../../../books/models.js";
import { newBook } from "../../../books/models.js";
import { DownloadProtocol } from "../../../indexers/DownloadProtocol.js";
import type { DownloadClientItem } from "../../downloadClients.js";
import { OsPath } from "../../../download-clients/OsPath.js";

/** Ported from NzbDrone.Core.Test/Download/TrackedDownloads/TrackedDownloadAlreadyImportedFixture.cs. */
describe("TrackedDownloadAlreadyImported", () => {
  let books: Book[];
  let trackedDownload: TrackedDownload;
  let historyItems: EntityHistoryRecord[];
  let subject: TrackedDownloadAlreadyImported;
  let nextBookId = 1;
  let nextHistoryId = 1;

  function makeBook(): Book {
    return { ...newBook(), id: nextBookId++ };
  }

  function makeDownloadItem(): DownloadClientItem {
    return {
      downloadClientInfo: {
        protocol: DownloadProtocol.Usenet,
        type: "Sabnzbd",
        id: 1,
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
  }

  beforeEach(() => {
    subject = new TrackedDownloadAlreadyImported();
    books = [];
    nextBookId = 1;
    nextHistoryId = 1;

    const remoteBook = newRemoteBook();
    remoteBook.books = books;

    trackedDownload = new TrackedDownload();
    trackedDownload.remoteBook = remoteBook;
    trackedDownload.downloadItem = makeDownloadItem();

    historyItems = [];
  });

  function givenBooks(count: number): void {
    for (let i = 0; i < count; i++) {
      books.push(makeBook());
    }
  }

  function givenHistoryForBook(book: Book, ...eventTypes: EntityHistoryEventType[]): void {
    for (const eventType of eventTypes) {
      historyItems.push({
        id: nextHistoryId++,
        bookId: book.id,
        authorId: 1,
        sourceTitle: "t",
        quality: { quality: 0, revision: { version: 1, real: 0, isRepack: false } } as never,
        date: new Date().toISOString(),
        eventType,
        data: {},
        downloadId: null,
      });
    }
  }

  it("should_return_false_if_there_is_no_history", () => {
    givenBooks(1);

    expect(subject.isImported(trackedDownload, historyItems)).toBe(false);
  });

  it("should_return_false_if_single_book_download_is_not_imported", () => {
    givenBooks(1);
    givenHistoryForBook(books[0]!, EntityHistoryEventType.Grabbed);

    expect(subject.isImported(trackedDownload, historyItems)).toBe(false);
  });

  it("should_return_false_if_no_book_in_multi_book_download_is_imported", () => {
    givenBooks(2);
    givenHistoryForBook(books[0]!, EntityHistoryEventType.Grabbed);
    givenHistoryForBook(books[1]!, EntityHistoryEventType.Grabbed);

    expect(subject.isImported(trackedDownload, historyItems)).toBe(false);
  });

  it("should_return_false_if_only_one_book_in_multi_book_download_is_imported", () => {
    givenBooks(2);
    givenHistoryForBook(
      books[0]!,
      EntityHistoryEventType.BookFileImported,
      EntityHistoryEventType.Grabbed
    );
    givenHistoryForBook(books[1]!, EntityHistoryEventType.Grabbed);

    expect(subject.isImported(trackedDownload, historyItems)).toBe(false);
  });

  it("should_return_true_if_single_book_download_is_imported", () => {
    givenBooks(1);
    givenHistoryForBook(
      books[0]!,
      EntityHistoryEventType.BookFileImported,
      EntityHistoryEventType.Grabbed
    );

    expect(subject.isImported(trackedDownload, historyItems)).toBe(true);
  });

  it("should_return_true_if_multi_book_download_is_imported", () => {
    givenBooks(2);
    givenHistoryForBook(
      books[0]!,
      EntityHistoryEventType.BookFileImported,
      EntityHistoryEventType.Grabbed
    );
    givenHistoryForBook(
      books[1]!,
      EntityHistoryEventType.BookFileImported,
      EntityHistoryEventType.Grabbed
    );

    expect(subject.isImported(trackedDownload, historyItems)).toBe(true);
  });

  it("should_return_true_if_remoteBook_is_null (nothing to check against)", () => {
    trackedDownload.remoteBook = null;
    historyItems.push({
      id: 1,
      bookId: 1,
      authorId: 1,
      sourceTitle: "t",
      quality: {} as never,
      date: new Date().toISOString(),
      eventType: EntityHistoryEventType.Grabbed,
      data: {},
      downloadId: null,
    });

    expect(subject.isImported(trackedDownload, historyItems)).toBe(true);
  });
});

import { describe, expect, it, vi } from "vitest";
import { RedownloadFailedDownloadService } from "../redownloadFailedDownloadService.js";
import { DownloadFailedEvent } from "../events.js";
import { ReleaseSourceType } from "../../parser/model/releaseInfo.js";
import type { IConfigService } from "../../config/configService.js";

function makeConfigService(overrides: Partial<IConfigService> = {}): IConfigService {
  return {
    autoRedownloadFailed: true,
    autoRedownloadFailedFromInteractiveSearch: true,
    ...overrides,
  } as IConfigService;
}

describe("RedownloadFailedDownloadService", () => {
  it("does nothing when skipRedownload is set", () => {
    const searchBooks = vi.fn();
    const subject = new RedownloadFailedDownloadService(
      makeConfigService(),
      { getBooksByAuthor: () => [] },
      {
        searchBooks,
      }
    );

    const event = new DownloadFailedEvent();
    event.skipRedownload = true;
    event.bookIds = [1];

    subject.handle(event);

    expect(searchBooks).not.toHaveBeenCalled();
  });

  it("does nothing when autoRedownloadFailed is disabled", () => {
    const searchBooks = vi.fn();
    const subject = new RedownloadFailedDownloadService(
      makeConfigService({ autoRedownloadFailed: false }),
      { getBooksByAuthor: () => [] },
      { searchBooks }
    );

    const event = new DownloadFailedEvent();
    event.bookIds = [1];

    subject.handle(event);

    expect(searchBooks).not.toHaveBeenCalled();
  });

  it("does nothing for an interactive-search failure when that override is disabled", () => {
    const searchBooks = vi.fn();
    const subject = new RedownloadFailedDownloadService(
      makeConfigService({ autoRedownloadFailedFromInteractiveSearch: false }),
      { getBooksByAuthor: () => [] },
      { searchBooks }
    );

    const event = new DownloadFailedEvent();
    event.bookIds = [1];
    event.releaseSource = ReleaseSourceType.InteractiveSearch;

    subject.handle(event);

    expect(searchBooks).not.toHaveBeenCalled();
  });

  it("searches the single book when only one bookId failed", () => {
    const searchBooks = vi.fn();
    const subject = new RedownloadFailedDownloadService(
      makeConfigService(),
      { getBooksByAuthor: () => [] },
      {
        searchBooks,
      }
    );

    const event = new DownloadFailedEvent();
    event.bookIds = [42];

    subject.handle(event);

    expect(searchBooks).toHaveBeenCalledWith([42]);
  });

  it("searches the whole author when every book in the author failed", () => {
    const searchAuthor = vi.fn();
    const subject = new RedownloadFailedDownloadService(
      makeConfigService(),
      { getBooksByAuthor: () => [{ id: 1 }, { id: 2 }] },
      { searchAuthor }
    );

    const event = new DownloadFailedEvent();
    event.authorId = 7;
    event.bookIds = [1, 2];

    subject.handle(event);

    expect(searchAuthor).toHaveBeenCalledWith(7);
  });

  it("searches just the failed books when only some of the author's books failed", () => {
    const searchBooks = vi.fn();
    const subject = new RedownloadFailedDownloadService(
      makeConfigService(),
      { getBooksByAuthor: () => [{ id: 1 }, { id: 2 }, { id: 3 }] },
      { searchBooks }
    );

    const event = new DownloadFailedEvent();
    event.authorId = 7;
    event.bookIds = [1, 2];

    subject.handle(event);

    expect(searchBooks).toHaveBeenCalledWith([1, 2]);
  });
});

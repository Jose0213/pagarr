import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  AuthorDeletedEvent,
  AuthorRefreshCompleteEvent,
  BookDeletedEvent,
  newAuthor,
  newAuthorMetadata,
  newBook,
  newEdition,
  type Author,
  type Book,
} from "../../books/index.js";
import { EventAggregator } from "../../messaging/index.js";
import { HttpHeader } from "../../http/HttpHeader.js";
import { HttpResponse } from "../../http/HttpResponse.js";
import type { HttpRequest } from "../../http/HttpRequest.js";
import type { IHttpClient } from "../../http/HttpClient.js";
import {
  MediaCoverService,
  type BookServiceLike,
  type MediaCoverServiceDiskProviderLike,
} from "../mediaCoverService.js";
import { MediaCoverEntity, MediaCoverTypes } from "../mediaCover.js";
import type { ICoverExistsSpecification } from "../coverAlreadyExistsSpecification.js";
import type { IImageResizer } from "../imageResizer.js";
import { MediaCoversUpdatedEvent } from "../mediaCoversUpdatedEvent.js";

/**
 * Ported from NzbDrone.Core.Test/MediaCoverTests/MediaCoverServiceFixture.cs.
 */

function fakeHttpClient(): IHttpClient {
  return {
    execute: vi.fn(async (request) => new HttpResponse(request, new HttpHeader(), "")),
    get: vi.fn(async (request) => new HttpResponse(request, new HttpHeader(), "")),
    head: vi.fn(),
    post: vi.fn(),
    getTyped: vi.fn(),
    postTyped: vi.fn(),
    downloadFile: vi.fn(async () => {}),
  };
}

function buildAuthor(): Author {
  return {
    ...newAuthor(),
    id: 2,
    metadata: {
      ...newAuthorMetadata(),
      id: 20,
      images: [{ coverType: "Poster", url: "" }],
    },
  };
}

function buildBookWithEdition(): { book: Book } {
  const edition = {
    ...newEdition(),
    id: 8,
    monitored: true,
    images: [{ coverType: "Cover", url: "" }],
  };
  const book = { ...newBook(), id: 4, editions: [edition] } as Book;
  return { book };
}

function buildDeps() {
  const diskProvider: MediaCoverServiceDiskProviderLike = {
    fileExists: vi.fn(() => true),
    getFileSize: vi.fn(() => 1000),
    fileGetLastWrite: vi.fn(() => 1234),
    fileSetLastWriteTime: vi.fn(),
    folderExists: vi.fn(() => true),
    deleteFolder: vi.fn(),
  };

  const coverExistsSpecification: ICoverExistsSpecification = {
    alreadyExists: vi.fn(() => false),
  };

  const resizer: IImageResizer = {
    resize: vi.fn(async () => {}),
  };

  const bookService: BookServiceLike = {
    getBooksByAuthor: vi.fn(() => []),
  };

  const mediaCoverProxy = { registerUrl: vi.fn(() => null) };

  const configFileProvider = { urlBase: "" };

  const eventAggregator = new EventAggregator();

  const httpClient = fakeHttpClient();

  return {
    diskProvider,
    coverExistsSpecification,
    resizer,
    bookService,
    mediaCoverProxy,
    configFileProvider,
    eventAggregator,
    httpClient,
  };
}

function buildService(deps: ReturnType<typeof buildDeps>) {
  return new MediaCoverService(
    deps.mediaCoverProxy,
    deps.resizer,
    deps.bookService,
    deps.httpClient,
    deps.diskProvider,
    "/data/MediaCover",
    deps.coverExistsSpecification,
    deps.configFileProvider,
    deps.eventAggregator
  );
}

describe("MediaCoverService", () => {
  let deps: ReturnType<typeof buildDeps>;

  beforeEach(() => {
    deps = buildDeps();
  });

  describe("convertToLocalUrls", () => {
    it.each([".png", ".jpg"])("should_convert_cover_urls_to_local (%s)", (extension) => {
      const service = buildService(deps);
      const covers = [{ url: "http://dummy.com/test" + extension, coverType: "Banner" }];

      service.convertToLocalUrls(12, MediaCoverEntity.Author, covers);

      expect(covers[0]!.url).toBe("/MediaCover/12/banner" + extension + "?lastWrite=1234");
    });

    it.each([".png", ".jpg"])(
      "convert_to_local_url_should_not_change_extension (%s)",
      (extension) => {
        const service = buildService(deps);
        const covers = [{ url: "http://dummy.com/test" + extension, coverType: "Banner" }];

        service.convertToLocalUrls(12, MediaCoverEntity.Author, covers);

        expect(covers[0]!.extension).toBe(extension);
      }
    );

    it.each([".png", ".jpg"])("should_convert_book_cover_urls_to_local (%s)", (extension) => {
      const service = buildService(deps);
      const covers = [{ url: "http://dummy.com/test" + extension, coverType: "Disc" }];

      service.convertToLocalUrls(6, MediaCoverEntity.Book, covers);

      expect(covers[0]!.url).toBe("/MediaCover/Books/6/disc" + extension + "?lastWrite=1234");
    });

    it.each([".png", ".jpg"])(
      "should_convert_media_urls_to_local_without_time_if_file_doesnt_exist (%s)",
      (extension) => {
        deps.diskProvider.fileExists = vi.fn(() => false);
        const service = buildService(deps);
        const covers = [{ url: "http://dummy.com/test" + extension, coverType: "Banner" }];

        service.convertToLocalUrls(12, MediaCoverEntity.Author, covers);

        expect(covers[0]!.url).toBe("/MediaCover/12/banner" + extension);
      }
    );

    it("registers unmapped author (id 0) covers through the proxy instead of a local path", () => {
      deps.mediaCoverProxy.registerUrl = vi.fn(() => "/MediaCoverProxy/abc/test.jpg");
      const service = buildService(deps);
      const covers = [{ url: "http://dummy.com/test.jpg", coverType: "Poster" }];

      service.convertToLocalUrls(0, MediaCoverEntity.Author, covers);

      expect(covers[0]!.remoteUrl).toBe("http://dummy.com/test.jpg");
      expect(covers[0]!.url).toBe("/MediaCoverProxy/abc/test.jpg");
      expect(deps.mediaCoverProxy.registerUrl).toHaveBeenCalledWith("http://dummy.com/test.jpg");
    });

    it("skips covers with an Unknown cover type", () => {
      const service = buildService(deps);
      const covers = [{ url: "http://dummy.com/test.jpg", coverType: "TotallyUnrecognized" }];

      service.convertToLocalUrls(12, MediaCoverEntity.Author, covers);

      expect(covers[0]!.url).toBe("http://dummy.com/test.jpg");
      expect(covers[0]!.remoteUrl).toBeUndefined();
    });
  });

  describe("HandleAsync(AuthorRefreshCompleteEvent)", () => {
    it("should_resize_covers_if_main_downloaded", async () => {
      deps.coverExistsSpecification.alreadyExists = vi.fn(() => false);
      const { book } = buildBookWithEdition();
      deps.bookService.getBooksByAuthor = vi.fn(() => [book]);
      deps.diskProvider.fileExists = vi.fn(() => true);

      const service = buildService(deps);
      const author = buildAuthor();

      await service.handleAsync(new AuthorRefreshCompleteEvent(author));

      expect(deps.resizer.resize).toHaveBeenCalledTimes(2);
    });

    it("should_resize_covers_if_missing", async () => {
      deps.coverExistsSpecification.alreadyExists = vi.fn(() => true);
      const { book } = buildBookWithEdition();
      deps.bookService.getBooksByAuthor = vi.fn(() => [book]);
      deps.diskProvider.fileExists = vi.fn(() => false);

      const service = buildService(deps);
      const author = buildAuthor();

      await service.handleAsync(new AuthorRefreshCompleteEvent(author));

      expect(deps.resizer.resize).toHaveBeenCalledTimes(2);
    });

    it("should_not_resize_covers_if_exists", async () => {
      deps.coverExistsSpecification.alreadyExists = vi.fn(() => true);
      deps.diskProvider.fileExists = vi.fn(() => true);
      deps.diskProvider.getFileSize = vi.fn(() => 1000);
      const { book } = buildBookWithEdition();
      deps.bookService.getBooksByAuthor = vi.fn(() => [book]);

      const service = buildService(deps);
      const author = buildAuthor();

      await service.handleAsync(new AuthorRefreshCompleteEvent(author));

      expect(deps.resizer.resize).not.toHaveBeenCalled();
    });

    it("should_resize_covers_if_existing_is_empty", async () => {
      deps.coverExistsSpecification.alreadyExists = vi.fn(() => true);
      deps.diskProvider.fileExists = vi.fn(() => true);
      deps.diskProvider.getFileSize = vi.fn(() => 0);
      const { book } = buildBookWithEdition();
      deps.bookService.getBooksByAuthor = vi.fn(() => [book]);

      const service = buildService(deps);
      const author = buildAuthor();

      await service.handleAsync(new AuthorRefreshCompleteEvent(author));

      expect(deps.resizer.resize).toHaveBeenCalledTimes(2);
    });

    it("should_log_error_if_resize_failed", async () => {
      deps.coverExistsSpecification.alreadyExists = vi.fn(() => true);
      deps.diskProvider.fileExists = vi.fn(() => false);
      const { book } = buildBookWithEdition();
      deps.bookService.getBooksByAuthor = vi.fn(() => [book]);
      deps.resizer.resize = vi.fn(async () => {
        throw new Error("boom");
      });

      const service = buildService(deps);
      const author = buildAuthor();

      await service.handleAsync(new AuthorRefreshCompleteEvent(author));

      // Both configured heights are still attempted even though resize throws each time.
      expect(deps.resizer.resize).toHaveBeenCalledTimes(2);
    });

    it("publishes MediaCoversUpdatedEvent for the author once done", async () => {
      const { book } = buildBookWithEdition();
      deps.bookService.getBooksByAuthor = vi.fn(() => [book]);

      const service = buildService(deps);
      const author = buildAuthor();

      const publishSpy = vi.spyOn(deps.eventAggregator, "publishEvent");

      await service.handleAsync(new AuthorRefreshCompleteEvent(author));

      expect(publishSpy).toHaveBeenCalledWith(expect.any(MediaCoversUpdatedEvent));
      const published = publishSpy.mock.calls.find(
        (c) => c[0] instanceof MediaCoversUpdatedEvent
      )?.[0] as MediaCoversUpdatedEvent | undefined;
      expect(published?.author).toBe(author);
      expect(published?.book).toBeNull();
    });

    it("ensures covers for every book returned by getBooksByAuthor", async () => {
      const { book: book1 } = buildBookWithEdition();
      const { book: book2 } = buildBookWithEdition();
      book2.id = 5;
      deps.bookService.getBooksByAuthor = vi.fn(() => [book1, book2]);

      const service = buildService(deps);
      const author = buildAuthor();

      await service.handleAsync(new AuthorRefreshCompleteEvent(author));

      expect(deps.bookService.getBooksByAuthor).toHaveBeenCalledWith(author.id);
    });
  });

  describe("HandleAsync(AuthorDeletedEvent)", () => {
    it("deletes the author's cover folder when it exists", async () => {
      deps.diskProvider.folderExists = vi.fn(() => true);
      const service = buildService(deps);
      const author = buildAuthor();

      await service.handleAsync(new AuthorDeletedEvent(author, false, false));

      expect(deps.diskProvider.deleteFolder).toHaveBeenCalledWith(
        expect.stringContaining(String(author.id)),
        true
      );
    });

    it("does nothing when the author's cover folder doesn't exist", async () => {
      deps.diskProvider.folderExists = vi.fn(() => false);
      const service = buildService(deps);
      const author = buildAuthor();

      await service.handleAsync(new AuthorDeletedEvent(author, false, false));

      expect(deps.diskProvider.deleteFolder).not.toHaveBeenCalled();
    });
  });

  describe("HandleAsync(BookDeletedEvent)", () => {
    it("deletes the book's cover folder when it exists", async () => {
      deps.diskProvider.folderExists = vi.fn(() => true);
      const service = buildService(deps);
      const { book } = buildBookWithEdition();

      await service.handleAsync(new BookDeletedEvent(book, false, false));

      expect(deps.diskProvider.deleteFolder).toHaveBeenCalledWith(
        expect.stringContaining(String(book.id)),
        true
      );
    });

    it("does nothing when the book's cover folder doesn't exist", async () => {
      deps.diskProvider.folderExists = vi.fn(() => false);
      const service = buildService(deps);
      const { book } = buildBookWithEdition();

      await service.handleAsync(new BookDeletedEvent(book, false, false));

      expect(deps.diskProvider.deleteFolder).not.toHaveBeenCalled();
    });
  });

  describe("ensureBookCovers", () => {
    it("only processes the monitored edition's Cover-type images", async () => {
      const monitoredEdition = {
        ...newEdition(),
        id: 1,
        monitored: true,
        images: [
          { coverType: "Cover", url: "http://dummy.com/cover.jpg" },
          { coverType: "Fanart", url: "http://dummy.com/fanart.jpg" },
        ],
      };
      const unmonitoredEdition = {
        ...newEdition(),
        id: 2,
        monitored: false,
        images: [{ coverType: "Cover", url: "http://dummy.com/unmonitored.jpg" }],
      };
      const book = {
        ...newBook(),
        id: 9,
        editions: [unmonitoredEdition, monitoredEdition],
      } as Book;

      const getCalls: string[] = [];
      deps.httpClient.get = vi.fn(async (request: HttpRequest) => {
        getCalls.push(request.url.toString());
        return new HttpResponse(request, new HttpHeader(), "");
      });

      const service = buildService(deps);
      await service.ensureBookCovers(book);

      expect(getCalls).toEqual(["http://dummy.com/cover.jpg"]);
    });
  });
});

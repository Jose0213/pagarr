import { describe, expect, it, vi } from "vitest";
import { newAuthor, newBook, type Author, type Book } from "../../books/models.js";
import { newBookFile, type BookFile } from "../../media-files-import/bookFile.js";
import { DeleteMediaFileReason } from "../../media-files-import/deleteMediaFileReason.js";
import { newQualityModel } from "../../qualities/qualityModel.js";
import { Quality } from "../../qualities/quality.js";
import { Revision } from "../../qualities/revision.js";
import type { INotification } from "../INotification.js";
import type { INotificationFactory } from "../NotificationFactory.js";
import {
  createNotificationDefinition,
  type NotificationDefinition,
} from "../NotificationDefinition.js";
import { NotificationService } from "../NotificationService.js";
import type { INotificationStatusService } from "../NotificationStatusService.js";
import { HealthCheckResult } from "../forwardRefs.js";

function author(overrides: Partial<Author> = {}): Author {
  return {
    ...newAuthor(),
    id: 1,
    metadata: {
      id: 1,
      foreignAuthorId: "",
      titleSlug: "",
      name: "Stephen King",
      nameLastFirst: "King, Stephen",
      sortName: "stephen king",
      sortNameLastFirst: "king, stephen",
      aliases: [],
      overview: null,
      disambiguation: "",
      gender: null,
      hometown: "",
      born: null,
      died: null,
      status: 0,
      images: [],
      links: [],
      genres: [],
      ratings: { votes: 0, value: 0 },
    },
    ...overrides,
  };
}

function book(overrides: Partial<Book> = {}): Book {
  return { ...newBook(), id: 1, title: "The Shining", ...overrides };
}

function bookFile(overrides: Partial<BookFile> = {}): BookFile {
  return {
    ...newBookFile(),
    id: 1,
    path: "/books/the-shining.epub",
    quality: newQualityModel(Quality.MP3, new Revision()),
    ...overrides,
  };
}

function fakeNotification(overrides: Partial<INotification> = {}): INotification {
  return {
    name: "Mock",
    configContract: "NullConfig",
    message: null,
    link: "https://example.test",
    defaultDefinitions: [],
    definition: createNotificationDefinition({ id: 1, name: "Mock", implementation: "Mock" }),
    test: vi.fn(async () => ({ isValid: true, hasWarnings: false, errors: [] })),
    requestAction: vi.fn(),
    onGrab: vi.fn(),
    onReleaseImport: vi.fn(),
    onRename: vi.fn(),
    onAuthorAdded: vi.fn(),
    onAuthorDelete: vi.fn(),
    onBookDelete: vi.fn(),
    onBookFileDelete: vi.fn(),
    onHealthIssue: vi.fn(),
    onApplicationUpdate: vi.fn(),
    onDownloadFailure: vi.fn(),
    onImportFailure: vi.fn(),
    onBookRetag: vi.fn(),
    processQueue: vi.fn(),
    supportsOnGrab: false,
    supportsOnReleaseImport: false,
    supportsOnUpgrade: false,
    supportsOnRename: false,
    supportsOnAuthorAdded: false,
    supportsOnAuthorDelete: false,
    supportsOnBookDelete: false,
    supportsOnBookFileDelete: false,
    supportsOnBookFileDeleteForUpgrade: false,
    supportsOnHealthIssue: false,
    supportsOnApplicationUpdate: false,
    supportsOnDownloadFailure: false,
    supportsOnImportFailure: false,
    supportsOnBookRetag: false,
    ...overrides,
  };
}

function fakeFactory(overrides: Partial<INotificationFactory> = {}): INotificationFactory {
  return {
    onGrabEnabled: () => [],
    onReleaseImportEnabled: () => [],
    onUpgradeEnabled: () => [],
    onRenameEnabled: () => [],
    onHealthIssueEnabled: () => [],
    onAuthorAddedEnabled: () => [],
    onAuthorDeleteEnabled: () => [],
    onBookDeleteEnabled: () => [],
    onBookFileDeleteEnabled: () => [],
    onBookFileDeleteForUpgradeEnabled: () => [],
    onDownloadFailureEnabled: () => [],
    onImportFailureEnabled: () => [],
    onBookRetagEnabled: () => [],
    onApplicationUpdateEnabled: () => [],
    getAvailableProviders: () => [],
    test: vi.fn(async () => ({ isValid: true, hasWarnings: false, errors: [] })),
    ...overrides,
  };
}

function fakeStatusService(): INotificationStatusService & {
  recordSuccess: ReturnType<typeof vi.fn>;
  recordFailure: ReturnType<typeof vi.fn>;
} {
  return {
    getBlockedProviders: () => [],
    recordSuccess: vi.fn(),
    recordFailure: vi.fn(),
    recordConnectionFailure: vi.fn(),
  };
}

describe("NotificationService", () => {
  describe("handleGrab", () => {
    it("builds the grab message as '{Author} - {Books} - [{Quality}]' and calls onGrab, recording success", async () => {
      const notification = fakeNotification();
      const factory = fakeFactory({ onGrabEnabled: () => [notification] });
      const statusService = fakeStatusService();
      const service = new NotificationService(factory, statusService);

      await service.handleGrab({
        book: {
          author: author(),
          books: [book({ title: "The Shining" })],
          parsedBookInfo: { quality: newQualityModel(Quality.MP3, new Revision()) },
        },
        downloadClientName: "SABnzbd",
        downloadClient: "Sabnzbd",
        downloadId: "abc123",
      });

      expect(notification.onGrab).toHaveBeenCalledTimes(1);
      const grabMessage = (notification.onGrab as ReturnType<typeof vi.fn>).mock.calls[0]![0];
      expect(grabMessage.message).toBe("Stephen King - The Shining - [MP3]");
      expect(statusService.recordSuccess).toHaveBeenCalledWith(1);
    });

    it("appends ' Proper' to the quality string when Revision.Version > 1", async () => {
      const notification = fakeNotification();
      const factory = fakeFactory({ onGrabEnabled: () => [notification] });
      const service = new NotificationService(factory, fakeStatusService());

      await service.handleGrab({
        book: {
          author: author(),
          books: [book()],
          parsedBookInfo: { quality: newQualityModel(Quality.MP3, new Revision({ version: 2 })) },
        },
        downloadClientName: null,
        downloadClient: null,
        downloadId: null,
      });

      const grabMessage = (notification.onGrab as ReturnType<typeof vi.fn>).mock.calls[0]![0];
      expect(grabMessage.message).toContain("MP3 Proper");
    });

    it("skips a notification whose tags don't intersect the author's tags", async () => {
      const notification = fakeNotification({
        definition: createNotificationDefinition({
          id: 1,
          name: "Mock",
          implementation: "Mock",
          tags: [5],
        }),
      });
      const factory = fakeFactory({ onGrabEnabled: () => [notification] });
      const service = new NotificationService(factory, fakeStatusService());

      await service.handleGrab({
        book: {
          author: author({ tags: [1] }),
          books: [book()],
          parsedBookInfo: { quality: newQualityModel() },
        },
        downloadClientName: null,
        downloadClient: null,
        downloadId: null,
      });

      expect(notification.onGrab).not.toHaveBeenCalled();
    });

    it("records failure and does not rethrow when a notification's onGrab throws", async () => {
      const notification = fakeNotification({
        onGrab: vi.fn(() => {
          throw new Error("boom");
        }),
      });
      const factory = fakeFactory({ onGrabEnabled: () => [notification] });
      const statusService = fakeStatusService();
      const service = new NotificationService(factory, statusService);

      await expect(
        service.handleGrab({
          book: {
            author: author(),
            books: [book()],
            parsedBookInfo: { quality: newQualityModel() },
          },
          downloadClientName: null,
          downloadClient: null,
          downloadId: null,
        })
      ).resolves.toBeUndefined();

      expect(statusService.recordFailure).toHaveBeenCalledWith(1);
    });
  });

  describe("handleBookImported", () => {
    it("does nothing when newDownload is false", async () => {
      const notification = fakeNotification();
      const factory = fakeFactory({ onReleaseImportEnabled: () => [notification] });
      const service = new NotificationService(factory, fakeStatusService());

      await service.handleBookImported({
        newDownload: false,
        author: author(),
        book: book(),
        downloadClientInfo: null,
        downloadId: null,
        importedBooks: [],
        oldFiles: [],
      });

      expect(notification.onReleaseImport).not.toHaveBeenCalled();
    });

    it("calls onReleaseImport when oldFiles is empty (a fresh import, not an upgrade)", async () => {
      const notification = fakeNotification();
      const factory = fakeFactory({ onReleaseImportEnabled: () => [notification] });
      const service = new NotificationService(factory, fakeStatusService());

      await service.handleBookImported({
        newDownload: true,
        author: author(),
        book: book(),
        downloadClientInfo: null,
        downloadId: null,
        importedBooks: [bookFile()],
        oldFiles: [],
      });

      expect(notification.onReleaseImport).toHaveBeenCalledTimes(1);
    });

    it("only calls onReleaseImport for an upgrade (oldFiles non-empty) when the definition's onUpgrade flag is set", async () => {
      const notUpgradeAware = fakeNotification({
        definition: createNotificationDefinition({ id: 1, implementation: "A", onUpgrade: false }),
      });
      const upgradeAware = fakeNotification({
        definition: createNotificationDefinition({ id: 2, implementation: "B", onUpgrade: true }),
      });
      const factory = fakeFactory({
        onReleaseImportEnabled: () => [notUpgradeAware, upgradeAware],
      });
      const service = new NotificationService(factory, fakeStatusService());

      await service.handleBookImported({
        newDownload: true,
        author: author(),
        book: book(),
        downloadClientInfo: null,
        downloadId: null,
        importedBooks: [bookFile()],
        oldFiles: [bookFile({ id: 2 })],
      });

      expect(notUpgradeAware.onReleaseImport).not.toHaveBeenCalled();
      expect(upgradeAware.onReleaseImport).toHaveBeenCalledTimes(1);
    });
  });

  describe("handleAuthorDeleted", () => {
    it("builds the AuthorDeleteMessage from the resolved author name and deleteFiles flag", async () => {
      const notification = fakeNotification();
      const factory = fakeFactory({ onAuthorDeleteEnabled: () => [notification] });
      const service = new NotificationService(factory, fakeStatusService());

      await service.handleAuthorDeleted({
        author: author(),
        authorName: "Stephen King",
        deleteFiles: true,
      });

      const deleteMessage = (notification.onAuthorDelete as ReturnType<typeof vi.fn>).mock
        .calls[0]![0];
      expect(deleteMessage.message).toBe(
        "Stephen King - Author removed and all files were deleted"
      );
    });
  });

  describe("handleBookDeleted", () => {
    it("skips notifying when the book has no populated author relation", async () => {
      const notification = fakeNotification();
      const factory = fakeFactory({ onBookDeleteEnabled: () => [notification] });
      const service = new NotificationService(factory, fakeStatusService());

      await service.handleBookDeleted({ book: book({ author: undefined }), deleteFiles: false });

      expect(notification.onBookDelete).not.toHaveBeenCalled();
    });

    it("notifies when the book's author relation is populated and tags allow it", async () => {
      const notification = fakeNotification();
      const factory = fakeFactory({ onBookDeleteEnabled: () => [notification] });
      const service = new NotificationService(factory, fakeStatusService());

      await service.handleBookDeleted({ book: book({ author: author() }), deleteFiles: true });

      expect(notification.onBookDelete).toHaveBeenCalledTimes(1);
    });
  });

  describe("handleBookFileDeleted", () => {
    it("only calls onBookFileDelete for an Upgrade-reason delete when the definition opts into OnBookFileDeleteForUpgrade", async () => {
      const notUpgradeAware = fakeNotification({
        definition: createNotificationDefinition({
          id: 1,
          implementation: "A",
          onBookFileDeleteForUpgrade: false,
        }),
      });
      const upgradeAware = fakeNotification({
        definition: createNotificationDefinition({
          id: 2,
          implementation: "B",
          onBookFileDeleteForUpgrade: true,
        }),
      });
      const factory = fakeFactory({
        onBookFileDeleteEnabled: () => [notUpgradeAware, upgradeAware],
      });
      const service = new NotificationService(factory, fakeStatusService());

      await service.handleBookFileDeleted({
        bookFile: bookFile({
          author: author(),
          edition: { id: 1, bookId: 1, book: book() } as never,
        }),
        reason: DeleteMediaFileReason.Upgrade,
      });

      expect(notUpgradeAware.onBookFileDelete).not.toHaveBeenCalled();
      expect(upgradeAware.onBookFileDelete).toHaveBeenCalledTimes(1);
    });

    it("notifies for a non-Upgrade delete reason regardless of the OnBookFileDeleteForUpgrade flag", async () => {
      const notification = fakeNotification({
        definition: createNotificationDefinition({
          id: 1,
          implementation: "A",
          onBookFileDeleteForUpgrade: false,
        }),
      });
      const factory = fakeFactory({ onBookFileDeleteEnabled: () => [notification] });
      const service = new NotificationService(factory, fakeStatusService());

      await service.handleBookFileDeleted({
        bookFile: bookFile({
          author: author(),
          edition: { id: 1, bookId: 1, book: book() } as never,
        }),
        reason: DeleteMediaFileReason.Manual,
      });

      expect(notification.onBookFileDelete).toHaveBeenCalledTimes(1);
    });
  });

  describe("handleHealthCheckFailed", () => {
    it("does not notify during the startup grace period", async () => {
      const notification = fakeNotification();
      const factory = fakeFactory({ onHealthIssueEnabled: () => [notification] });
      const service = new NotificationService(factory, fakeStatusService());

      await service.handleHealthCheckFailed({
        healthCheck: {
          id: 1,
          type: HealthCheckResult.Error,
          message: "disk full",
          source: { name: "Test" },
          wikiUrl: null,
        },
        isInStartupGracePeriod: true,
      });

      expect(notification.onHealthIssue).not.toHaveBeenCalled();
    });

    it("notifies for Error-level health checks regardless of IncludeHealthWarnings", async () => {
      const notification = fakeNotification({
        definition: createNotificationDefinition({
          id: 1,
          implementation: "A",
          includeHealthWarnings: false,
        }),
      });
      const factory = fakeFactory({ onHealthIssueEnabled: () => [notification] });
      const service = new NotificationService(factory, fakeStatusService());

      await service.handleHealthCheckFailed({
        healthCheck: {
          id: 1,
          type: HealthCheckResult.Error,
          message: "disk full",
          source: { name: "Test" },
          wikiUrl: null,
        },
        isInStartupGracePeriod: false,
      });

      expect(notification.onHealthIssue).toHaveBeenCalledTimes(1);
    });

    it("only notifies for Warning-level health checks when IncludeHealthWarnings is set", async () => {
      const notIncluded = fakeNotification({
        definition: createNotificationDefinition({
          id: 1,
          implementation: "A",
          includeHealthWarnings: false,
        }),
      });
      const included = fakeNotification({
        definition: createNotificationDefinition({
          id: 2,
          implementation: "B",
          includeHealthWarnings: true,
        }),
      });
      const factory = fakeFactory({ onHealthIssueEnabled: () => [notIncluded, included] });
      const service = new NotificationService(factory, fakeStatusService());

      await service.handleHealthCheckFailed({
        healthCheck: {
          id: 1,
          type: HealthCheckResult.Warning,
          message: "slow disk",
          source: { name: "Test" },
          wikiUrl: null,
        },
        isInStartupGracePeriod: false,
      });

      expect(notIncluded.onHealthIssue).not.toHaveBeenCalled();
      expect(included.onHealthIssue).toHaveBeenCalledTimes(1);
    });

    it("never notifies for Ok/Notice-level health checks", async () => {
      const notification = fakeNotification({
        definition: createNotificationDefinition({
          id: 1,
          implementation: "A",
          includeHealthWarnings: true,
        }),
      });
      const factory = fakeFactory({ onHealthIssueEnabled: () => [notification] });
      const service = new NotificationService(factory, fakeStatusService());

      await service.handleHealthCheckFailed({
        healthCheck: {
          id: 1,
          type: HealthCheckResult.Notice,
          message: "info",
          source: { name: "Test" },
          wikiUrl: null,
        },
        isInStartupGracePeriod: false,
      });

      expect(notification.onHealthIssue).not.toHaveBeenCalled();
    });
  });

  describe("handleApplicationUpdate", () => {
    it("builds the update message as 'Readarr updated from {prev} to {new}' and notifies unconditionally (no author/tag gate)", async () => {
      const notification = fakeNotification();
      const factory = fakeFactory({ onApplicationUpdateEnabled: () => [notification] });
      const service = new NotificationService(factory, fakeStatusService());

      await service.handleApplicationUpdate({ previousVersion: "1.0.0", newVersion: "1.1.0" });

      const updateMessage = (notification.onApplicationUpdate as ReturnType<typeof vi.fn>).mock
        .calls[0]![0];
      expect(updateMessage.message).toBe("Readarr updated from 1.0.0 to 1.1.0");
      expect(updateMessage.newVersion).toBe("1.1.0");
    });
  });

  describe("handleDeleteCompleted", () => {
    it("calls processQueue() on every available provider, matching HandleAsync(DeleteCompletedEvent) -> ProcessQueue()", async () => {
      const notification = fakeNotification();
      const factory = fakeFactory({ getAvailableProviders: () => [notification] });
      const service = new NotificationService(factory, fakeStatusService());

      await service.handleDeleteCompleted({});

      expect(notification.processQueue).toHaveBeenCalledTimes(1);
    });

    it("does not throw when a provider's processQueue() throws -- isolated per-provider like the C# try/catch", async () => {
      const notification = fakeNotification({
        processQueue: vi.fn(() => {
          throw new Error("queue boom");
        }),
      });
      const factory = fakeFactory({ getAvailableProviders: () => [notification] });
      const service = new NotificationService(factory, fakeStatusService());

      await expect(service.handleDeleteCompleted({})).resolves.toBeUndefined();
    });
  });

  describe("handleBookFileRetagged", () => {
    it("formats the diff as 'key: old -> new' lines prefixed with the file path", async () => {
      const notification = fakeNotification();
      const factory = fakeFactory({ onBookRetagEnabled: () => [notification] });
      const service = new NotificationService(factory, fakeStatusService());

      await service.handleBookFileRetagged({
        author: author(),
        bookFile: bookFile({ path: "/books/it.epub" }),
        diff: { Title: ["Old Title", "New Title"] },
        scrubbed: false,
      });

      const retagMessage = (notification.onBookRetag as ReturnType<typeof vi.fn>).mock.calls[0]![0];
      expect(retagMessage.message).toContain("/books/it.epub:");
      expect(retagMessage.message).toContain("Title: Old Title → New Title");
    });

    it("formats a missing (null/empty) diff value as '<missing>', matching FormatMissing()", async () => {
      const notification = fakeNotification();
      const factory = fakeFactory({ onBookRetagEnabled: () => [notification] });
      const service = new NotificationService(factory, fakeStatusService());

      await service.handleBookFileRetagged({
        author: author(),
        bookFile: bookFile(),
        diff: { Title: ["", "New Title"] },
        scrubbed: false,
      });

      const retagMessage = (notification.onBookRetag as ReturnType<typeof vi.fn>).mock.calls[0]![0];
      expect(retagMessage.message).toContain("Title: <missing> → New Title");
    });
  });

  describe("handleBookImportIncomplete", () => {
    it("builds the message as 'Readarr failed to Import all files for {source}'", async () => {
      const notification = fakeNotification();
      const factory = fakeFactory({ onImportFailureEnabled: () => [notification] });
      const service = new NotificationService(factory, fakeStatusService());

      await service.handleBookImportIncomplete({
        sourceTitle: "some.release.name",
        trackedDownloadAuthor: author(),
      });

      const downloadMessage = (notification.onImportFailure as ReturnType<typeof vi.fn>).mock
        .calls[0]![0];
      expect(downloadMessage.message).toBe(
        "Readarr failed to Import all files for some.release.name"
      );
    });
  });
});

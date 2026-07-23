import { describe, expect, it, vi } from "vitest";
import { SynologyIndexer } from "../SynologyIndexer.js";
import type { ISynologyIndexerProxy } from "../SynologyIndexerProxy.js";
import { createSynologyIndexerSettings } from "../SynologyIndexerSettings.js";
import { createNotificationDefinition } from "../../NotificationDefinition.js";
import { createAuthorDeleteMessage } from "../../AuthorDeleteMessage.js";
import { createBookDeleteMessage } from "../../BookDeleteMessage.js";
import { testAuthor, testBook, testBookFile } from "../../__tests__/testFixtures.js";

function fakeProxy(overrides: Partial<ISynologyIndexerProxy> = {}): ISynologyIndexerProxy {
  return {
    test: vi.fn(async () => true),
    addFile: vi.fn(async () => {}),
    deleteFile: vi.fn(async () => {}),
    addFolder: vi.fn(async () => {}),
    deleteFolder: vi.fn(async () => {}),
    updateFolder: vi.fn(async () => {}),
    updateLibrary: vi.fn(async () => {}),
    ...overrides,
  };
}

function buildNotifier(
  proxy: ISynologyIndexerProxy = fakeProxy(),
  updateLibrary = true
): SynologyIndexer {
  const notifier = new SynologyIndexer(proxy);
  notifier.definition = createNotificationDefinition({
    settings: createSynologyIndexerSettings({ updateLibrary }),
  });
  return notifier;
}

describe("SynologyIndexer", () => {
  it("does nothing when updateLibrary is false", async () => {
    const proxy = fakeProxy();
    const notifier = buildNotifier(proxy, false);

    await notifier.onReleaseImport({
      message: "",
      author: testAuthor(),
      book: testBook(testAuthor()),
      bookFiles: [testBookFile()],
      oldFiles: [testBookFile({ path: "/old/path.mp3" })],
      downloadClientInfo: null,
      downloadId: null,
    });

    expect(proxy.addFile).not.toHaveBeenCalled();
    expect(proxy.deleteFile).not.toHaveBeenCalled();
  });

  it("onReleaseImport deletes old files then adds new files", async () => {
    const proxy = fakeProxy();
    const notifier = buildNotifier(proxy);

    await notifier.onReleaseImport({
      message: "",
      author: testAuthor(),
      book: testBook(testAuthor()),
      bookFiles: [testBookFile({ path: "/new/path.mp3" })],
      oldFiles: [testBookFile({ path: "/old/path.mp3" })],
      downloadClientInfo: null,
      downloadId: null,
    });

    expect(proxy.deleteFile).toHaveBeenCalledWith("/old/path.mp3");
    expect(proxy.addFile).toHaveBeenCalledWith("/new/path.mp3");
  });

  it("onRename calls updateFolder with the author path", async () => {
    const proxy = fakeProxy();
    const notifier = buildNotifier(proxy);

    await notifier.onRename(testAuthor({ path: "/authors/x" }), []);

    expect(proxy.updateFolder).toHaveBeenCalledWith("/authors/x");
  });

  it("onAuthorDelete calls deleteFolder regardless of deletedFiles flag (ported 1:1 -- no deletedFiles gate in the real C#)", async () => {
    const proxy = fakeProxy();
    const notifier = buildNotifier(proxy);

    const author = testAuthor({ path: "/authors/x" });
    await notifier.onAuthorDelete(
      createAuthorDeleteMessage(author, author.metadata?.name ?? "", false)
    );

    expect(proxy.deleteFolder).toHaveBeenCalledWith("/authors/x");
  });

  it("onBookDelete only deletes files when deletedFiles is true", async () => {
    const proxy = fakeProxy();
    const notifier = buildNotifier(proxy);
    const book = testBook(testAuthor());
    (book as unknown as { bookFiles: unknown }).bookFiles = [testBookFile({ path: "/a.mp3" })];

    await notifier.onBookDelete(createBookDeleteMessage(book, false));
    expect(proxy.deleteFile).not.toHaveBeenCalled();

    await notifier.onBookDelete(createBookDeleteMessage(book, true));
    expect(proxy.deleteFile).toHaveBeenCalledWith("/a.mp3");
  });

  it("onBookFileDelete calls deleteFile with the file path", async () => {
    const proxy = fakeProxy();
    const notifier = buildNotifier(proxy);

    await notifier.onBookFileDelete({
      message: "",
      book: testBook(testAuthor()),
      bookFile: testBookFile({ path: "/gone.mp3" }),
      reason: "Manual" as never,
    });

    expect(proxy.deleteFile).toHaveBeenCalledWith("/gone.mp3");
  });

  it("test() rejects with 'Must be a Synology' when not running on Linux", async () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, "platform", { value: "win32" });

    try {
      const notifier = buildNotifier();
      const result = await notifier.test();
      expect(result.isValid).toBe(false);
      expect(result.errors[0]!.errorMessage).toBe("Must be a Synology");
    } finally {
      Object.defineProperty(process, "platform", { value: originalPlatform });
    }
  });

  it("test() delegates to indexerProxy.test() when running on Linux", async () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, "platform", { value: "linux" });

    try {
      const proxy = fakeProxy({ test: vi.fn(async () => false) });
      const notifier = buildNotifier(proxy);
      const result = await notifier.test();
      expect(result.isValid).toBe(false);
      expect(result.errors[0]!.errorMessage).toContain("synoindex not available");
    } finally {
      Object.defineProperty(process, "platform", { value: originalPlatform });
    }
  });
});

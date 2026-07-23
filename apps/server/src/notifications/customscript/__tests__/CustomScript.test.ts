import { describe, expect, it, vi } from "vitest";
import { CustomScript, type DiskProviderLike } from "../CustomScript.js";
import { createCustomScriptSettings } from "../CustomScriptSettings.js";
import type { IProcessProvider, ProcessOutput } from "../../ProcessProvider.js";
import { createNotificationDefinition } from "../../NotificationDefinition.js";
import { newQualityModel } from "../../../qualities/qualityModel.js";
import { newParsedBookInfo } from "../../../parser/model/parsedBookInfo.js";
import { newReleaseInfo } from "../../../parser/model/releaseInfo.js";
import { newRemoteBook } from "../../../parser/model/remoteBook.js";
import { createAuthorDeleteMessage } from "../../AuthorDeleteMessage.js";
import { createBookDeleteMessage } from "../../BookDeleteMessage.js";
import type { GrabMessage } from "../../GrabMessage.js";
import type { BookFileDeleteMessage } from "../../BookFileDeleteMessage.js";
import {
  noopLogger,
  testAuthor,
  testBook,
  testBookFile,
  testEdition,
} from "../../__tests__/testFixtures.js";

function output(exitCode = 0): ProcessOutput {
  return { exitCode, lines: [], standard: [], error: [] };
}

function fakeProcessProvider(result: ProcessOutput = output()): IProcessProvider {
  return { startAndCapture: vi.fn(async () => result) };
}

function fakeDiskProvider(exists = true): DiskProviderLike {
  return { fileExists: vi.fn(() => exists) };
}

function buildNotifier(
  diskProvider: DiskProviderLike = fakeDiskProvider(),
  processProvider: IProcessProvider = fakeProcessProvider()
): CustomScript {
  const notifier = new CustomScript(diskProvider, processProvider, noopLogger());
  notifier.definition = createNotificationDefinition({
    settings: createCustomScriptSettings({ path: "/bin/notify.sh" }),
  });
  return notifier;
}

describe("CustomScript env var construction", () => {
  it("onAuthorAdded sets Readarr_EventType=AuthorAdded and author fields (env var names kept Readarr_-prefixed)", async () => {
    const processProvider = fakeProcessProvider();
    const notifier = buildNotifier(fakeDiskProvider(), processProvider);
    const author = testAuthor({ id: 9, path: "/authors/x" });

    await notifier.onAuthorAdded(author);

    const [, , env] = (processProvider.startAndCapture as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(env.Readarr_EventType).toBe("AuthorAdded");
    expect(env.Readarr_Author_Id).toBe("9");
    expect(env.Readarr_Author_Path).toBe("/authors/x");
  });

  it("onAuthorDelete sets DeletedFiles as a stringified boolean", async () => {
    const processProvider = fakeProcessProvider();
    const notifier = buildNotifier(fakeDiskProvider(), processProvider);
    const author = testAuthor();

    await notifier.onAuthorDelete(
      createAuthorDeleteMessage(author, author.metadata?.name ?? "", true)
    );

    const [, , env] = (processProvider.startAndCapture as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(env.Readarr_EventType).toBe("AuthorDelete");
    expect(env.Readarr_Author_DeletedFiles).toBe("true");
  });

  it("onBookDelete uses the book's author and includes GoodreadsId fields", async () => {
    const processProvider = fakeProcessProvider();
    const notifier = buildNotifier(fakeDiskProvider(), processProvider);
    const book = testBook(testAuthor({ path: "/authors/y" }));

    await notifier.onBookDelete(createBookDeleteMessage(book, true));

    const [, , env] = (processProvider.startAndCapture as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(env.Readarr_EventType).toBe("BookDelete");
    expect(env.Readarr_Author_Path).toBe("/authors/y");
    expect(env.Readarr_Book_DeletedFiles).toBe("true");
  });

  it("onBookFileDelete throws when the book has no author set (matches C#'s deleteMessage.Book.Author.Value dereference)", async () => {
    const notifier = buildNotifier();
    const book = testBook(testAuthor(), { author: undefined });

    const deleteMessage: BookFileDeleteMessage = {
      message: "",
      book,
      bookFile: testBookFile(),
      reason: "Manual" as never,
    };

    await expect(notifier.onBookFileDelete(deleteMessage)).rejects.toThrow();
  });

  it("onGrab throws when a release book has zero or multiple monitored editions (Single() invariant)", async () => {
    const notifier = buildNotifier();

    const quality = newQualityModel();
    const author = testAuthor();

    const grabMessage: GrabMessage = {
      message: "",
      author,
      remoteBook: {
        ...newRemoteBook(),
        author,
        books: [testBook(author, { editions: [testEdition({ monitored: false })] })],
        parsedBookInfo: { ...newParsedBookInfo(), quality },
        release: { ...newReleaseInfo(), title: "Release", indexer: "indexer", size: 100 },
      },
      quality,
      downloadClientType: null,
      downloadClientName: null,
      downloadId: null,
    };

    await expect(notifier.onGrab(grabMessage)).rejects.toThrow();
  });
});

describe("CustomScript.test", () => {
  it("fails validation with 'File does not exist' when diskProvider.fileExists returns false", async () => {
    const notifier = buildNotifier(fakeDiskProvider(false));

    const result = await notifier.test();

    expect(result.isValid).toBe(false);
    expect(result.errors[0]!.errorMessage).toBe("File does not exist");
  });

  it("does not run the test script when the path check already failed", async () => {
    const processProvider = fakeProcessProvider();
    const notifier = buildNotifier(fakeDiskProvider(false), processProvider);

    await notifier.test();

    expect(processProvider.startAndCapture).not.toHaveBeenCalled();
  });

  it("runs the script with EventType=Test and succeeds on exit code 0", async () => {
    const processProvider = fakeProcessProvider(output(0));
    const notifier = buildNotifier(fakeDiskProvider(true), processProvider);

    const result = await notifier.test();

    expect(result.isValid).toBe(true);
    const [, , env] = (processProvider.startAndCapture as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(env.Readarr_EventType).toBe("Test");
  });

  it("fails validation with the exit code when the script exits non-zero", async () => {
    const processProvider = fakeProcessProvider(output(2));
    const notifier = buildNotifier(fakeDiskProvider(true), processProvider);

    const result = await notifier.test();

    expect(result.isValid).toBe(false);
    expect(result.errors[0]!.errorMessage).toBe("Script exited with code: 2");
  });

  it("catches an exception thrown while executing the script and reports it as a failure", async () => {
    const processProvider: IProcessProvider = {
      startAndCapture: vi.fn(async () => {
        throw new Error("spawn failed");
      }),
    };
    const notifier = buildNotifier(fakeDiskProvider(true), processProvider);

    const result = await notifier.test();

    expect(result.isValid).toBe(false);
    expect(result.errors[0]!.errorMessage).toBe("spawn failed");
  });
});

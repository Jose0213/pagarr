import { describe, expect, it, vi } from "vitest";
import { Kavita } from "../Kavita.js";
import type { IKavitaService } from "../KavitaService.js";
import { createKavitaSettings } from "../KavitaSettings.js";
import { createNotificationDefinition } from "../../NotificationDefinition.js";
import { createBookDeleteMessage } from "../../BookDeleteMessage.js";
import { noopLogger, testAuthor, testBook, testBookFile } from "../../__tests__/testFixtures.js";

function fakeService(overrides: Partial<IKavitaService> = {}): IKavitaService {
  return {
    notify: vi.fn(async () => {}),
    test: vi.fn(async () => null),
    ...overrides,
  };
}

function buildNotifier(
  service: IKavitaService = fakeService(),
  overrides: Parameters<typeof createKavitaSettings>[0] = {}
): Kavita {
  const notifier = new Kavita(service, noopLogger());
  notifier.definition = createNotificationDefinition({
    settings: createKavitaSettings({
      host: "kavita.local",
      apiKey: "key",
      notify: true,
      ...overrides,
    }),
  });
  return notifier;
}

describe("Kavita notifier", () => {
  it("onReleaseImport notifies with the parent directory of the first (deduplicated) book file path", async () => {
    const service = fakeService();
    const notifier = buildNotifier(service);

    await notifier.onReleaseImport({
      message: "",
      author: null,
      book: testBook(testAuthor()),
      bookFiles: [
        testBookFile({ path: "/library/Author/Book/file1.epub" }),
        testBookFile({ path: "/library/Author/Book/file2.epub" }),
      ],
      oldFiles: [],
      downloadClientInfo: null,
      downloadId: null,
    });

    expect(service.notify).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining("Book Downloaded")
    );
    const [, message] = (service.notify as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(message).toContain("Author");
    expect(message).toContain("Book");
    expect(message).not.toContain("file1.epub");
  });

  it("onBookFileDelete notifies with the parent directory of the deleted file", async () => {
    const service = fakeService();
    const notifier = buildNotifier(service);

    await notifier.onBookFileDelete({
      message: "",
      book: testBook(testAuthor()),
      bookFile: testBookFile({ path: "/library/Author/Book/file.epub" }),
      reason: "Manual" as never,
    });

    const [, message] = (service.notify as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(message).toContain("Book File Deleted");
    expect(message).toContain("/library/Author/Book");
    expect(message).not.toContain("file.epub");
  });

  it("does not notify when settings.notify is false", async () => {
    const service = fakeService();
    const notifier = buildNotifier(service, { notify: false });

    await notifier.onBookFileDelete({
      message: "",
      book: testBook(testAuthor()),
      bookFile: testBookFile(),
      reason: "Manual" as never,
    });

    expect(service.notify).not.toHaveBeenCalled();
  });

  it("propagates a KavitaException from notify", async () => {
    const { KavitaException } = await import("../KavitaException.js");
    const service = fakeService({
      notify: vi.fn(async () => {
        throw new KavitaException("Could not authenticate with Kavita");
      }),
    });
    const notifier = buildNotifier(service);

    await expect(
      notifier.onBookFileDelete({
        message: "",
        book: testBook(testAuthor()),
        bookFile: testBookFile(),
        reason: "Manual" as never,
      })
    ).rejects.toThrow("Could not authenticate with Kavita");
  });

  it("suppresses a non-KavitaException failure (SocketException equivalent)", async () => {
    const service = fakeService({
      notify: vi.fn(async () => {
        throw new Error("ECONNREFUSED");
      }),
    });
    const notifier = buildNotifier(service);

    await expect(
      notifier.onBookFileDelete({
        message: "",
        book: testBook(testAuthor()),
        bookFile: testBookFile(),
        reason: "Manual" as never,
      })
    ).resolves.toBeUndefined();
  });

  it("test() delegates to kavitaService.test", async () => {
    const service = fakeService({
      test: vi.fn(async () => ({ propertyName: "ApiKey", errorMessage: "Incorrect ApiKey" })),
    });
    const notifier = buildNotifier(service);

    const result = await notifier.test();

    expect(result.isValid).toBe(false);
    expect(result.errors[0]!.propertyName).toBe("ApiKey");
  });

  it("onBookDelete uses the book's (augmented) bookFiles list", async () => {
    const service = fakeService();
    const notifier = buildNotifier(service);
    const book = testBook(testAuthor());
    (book as unknown as { bookFiles: unknown }).bookFiles = [
      testBookFile({ path: "/library/Author/Book/f.epub" }),
    ];

    await notifier.onBookDelete(createBookDeleteMessage(book, true));

    expect(service.notify).toHaveBeenCalled();
  });
});

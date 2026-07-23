import { describe, expect, it, vi } from "vitest";
import { Subsonic } from "../Subsonic.js";
import type { ISubsonicService } from "../SubsonicService.js";
import { createSubsonicSettings } from "../SubsonicSettings.js";
import { createNotificationDefinition } from "../../NotificationDefinition.js";
import { createAuthorDeleteMessage } from "../../AuthorDeleteMessage.js";
import { createBookDeleteMessage } from "../../BookDeleteMessage.js";
import type { GrabMessage } from "../../GrabMessage.js";
import { newParsedBookInfo } from "../../../parser/model/parsedBookInfo.js";
import { newReleaseInfo } from "../../../parser/model/releaseInfo.js";
import { newRemoteBook } from "../../../parser/model/remoteBook.js";
import { newQualityModel } from "../../../qualities/qualityModel.js";
import { noopLogger, testAuthor, testBook } from "../../__tests__/testFixtures.js";

function fakeService(overrides: Partial<ISubsonicService> = {}): ISubsonicService {
  return {
    notify: vi.fn(async () => {}),
    update: vi.fn(async () => {}),
    test: vi.fn(async () => null),
    ...overrides,
  };
}

function buildNotifier(
  service: ISubsonicService = fakeService(),
  settingsOverrides: Parameters<typeof createSubsonicSettings>[0] = {}
): Subsonic {
  const notifier = new Subsonic(service, noopLogger());
  notifier.definition = createNotificationDefinition({
    settings: createSubsonicSettings({
      host: "subsonic.local",
      notify: true,
      updateLibrary: true,
      ...settingsOverrides,
    }),
  });
  return notifier;
}

describe("Subsonic notifier", () => {
  it("onGrab sends a notify with the 'Readarr - Grabbed' header", async () => {
    const service = fakeService();
    const notifier = buildNotifier(service);
    const author = testAuthor();
    const quality = newQualityModel();

    const grabMessage: GrabMessage = {
      message: "Some Book",
      author,
      remoteBook: {
        ...newRemoteBook(),
        author,
        parsedBookInfo: { ...newParsedBookInfo(), quality },
        release: { ...newReleaseInfo() },
      },
      quality,
      downloadClientType: null,
      downloadClientName: null,
      downloadId: null,
    };

    await notifier.onGrab(grabMessage);

    expect(service.notify).toHaveBeenCalledWith(expect.anything(), "Readarr - Grabbed - Some Book");
  });

  it("does not call notify when settings.notify is false", async () => {
    const service = fakeService();
    const notifier = buildNotifier(service, { notify: false });

    await notifier.onAuthorAdded(testAuthor());

    expect(service.notify).not.toHaveBeenCalled();
  });

  it("onReleaseImport notifies then updates the library", async () => {
    const service = fakeService();
    const notifier = buildNotifier(service);

    const releaseAuthor = testAuthor();
    await notifier.onReleaseImport({
      message: "Imported",
      author: releaseAuthor,
      book: testBook(releaseAuthor),
      bookFiles: [],
      oldFiles: [],
      downloadClientInfo: null,
      downloadId: null,
    });

    expect(service.notify).toHaveBeenCalled();
    expect(service.update).toHaveBeenCalled();
  });

  it("onAuthorDelete only updates the library when deletedFiles is true", async () => {
    const service = fakeService();
    const notifier = buildNotifier(service);
    const author = testAuthor();

    await notifier.onAuthorDelete(
      createAuthorDeleteMessage(author, author.metadata?.name ?? "", false)
    );
    expect(service.update).not.toHaveBeenCalled();

    await notifier.onAuthorDelete(
      createAuthorDeleteMessage(author, author.metadata?.name ?? "", true)
    );
    expect(service.update).toHaveBeenCalledTimes(1);
  });

  it("onBookDelete only updates the library when deletedFiles is true", async () => {
    const service = fakeService();
    const notifier = buildNotifier(service);
    const book = testBook(testAuthor());

    await notifier.onBookDelete(createBookDeleteMessage(book, false));
    expect(service.update).not.toHaveBeenCalled();

    await notifier.onBookDelete(createBookDeleteMessage(book, true));
    expect(service.update).toHaveBeenCalledTimes(1);
  });

  it("suppresses a non-SubsonicException failure from notify/update (SocketException equivalent)", async () => {
    const service = fakeService({
      notify: vi.fn(async () => {
        throw new Error("ECONNREFUSED");
      }),
    });
    const notifier = buildNotifier(service);

    await expect(notifier.onAuthorAdded(testAuthor())).resolves.toBeUndefined();
  });

  it("propagates a genuine SubsonicException from notify", async () => {
    const { SubsonicException } = await import("../SubsonicException.js");
    const service = fakeService({
      notify: vi.fn(async () => {
        throw new SubsonicException("Incorrect username or password");
      }),
    });
    const notifier = buildNotifier(service);

    await expect(notifier.onAuthorAdded(testAuthor())).rejects.toThrow(
      "Incorrect username or password"
    );
  });

  it("test() delegates to subsonicService.test and reports failures", async () => {
    const service = fakeService({
      test: vi.fn(async () => ({ propertyName: "Username", errorMessage: "bad creds" })),
    });
    const notifier = buildNotifier(service);

    const result = await notifier.test();

    expect(result.isValid).toBe(false);
    expect(result.errors[0]!.propertyName).toBe("Username");
  });
});

import { describe, expect, it, vi } from "vitest";
import { testAuthor } from "../../__tests__/testFixtures.js";
import type { NotificationDefinition } from "../../NotificationDefinition.js";
import { createNotificationDefinition } from "../../NotificationDefinition.js";
import type { DownloadFailedMessage } from "../../DownloadFailedMessage.js";
import type { BookDownloadMessage } from "../../BookDownloadMessage.js";
import { Signal } from "../Signal.js";
import { createSignalSettings } from "../SignalSettings.js";
import type { ISignalProxy } from "../SignalProxy.js";

function buildSubject(proxy: ISignalProxy) {
  const subject = new Signal(proxy);
  subject.definition = createNotificationDefinition<ReturnType<typeof createSignalSettings>>({
    id: 1,
    name: "Signal",
    implementationName: "Signal",
    implementation: "Signal",
    configContract: "SignalSettings",
    enable: true,
    settings: createSignalSettings({
      host: "localhost",
      port: 8080,
      senderNumber: "+1",
      receiverId: "+2",
    }),
  });
  return subject;
}

/** Fills in DownloadFailedMessage's required-but-nullable fields this test suite doesn't exercise. */
function downloadFailedMessage(
  overrides: Pick<DownloadFailedMessage, "message" | "sourceTitle">
): DownloadFailedMessage {
  return {
    quality: null,
    downloadClient: null,
    downloadId: null,
    ...overrides,
  };
}

/** Fills in BookDownloadMessage's required-but-nullable fields this test suite doesn't exercise. */
function bookDownloadMessage(
  overrides: Pick<BookDownloadMessage, "message" | "author">
): BookDownloadMessage {
  return {
    book: null,
    bookFiles: null,
    oldFiles: null,
    downloadClientInfo: null,
    downloadId: null,
    ...overrides,
  };
}

describe("Signal", () => {
  it("delegates every On* handler to proxy.sendNotification with the branded title constant", async () => {
    const sendNotification = vi.fn(async () => {});
    const subject = buildSubject({ sendNotification, test: vi.fn() });

    await subject.onDownloadFailure(
      downloadFailedMessage({ message: "dl failed", sourceTitle: "x" })
    );
    expect(sendNotification).toHaveBeenLastCalledWith(
      "Download Failed",
      "dl failed",
      subject.definition.settings
    );

    await subject.onImportFailure(
      bookDownloadMessage({ message: "import failed", author: testAuthor() })
    );
    expect(sendNotification).toHaveBeenLastCalledWith(
      "Import Failed",
      "import failed",
      subject.definition.settings
    );
  });

  it("supports exactly the events Signal.cs overrides (no OnRename/OnBookRetag)", () => {
    const subject = buildSubject({ sendNotification: vi.fn(), test: vi.fn() });
    expect(subject.supportsOnGrab).toBe(true);
    expect(subject.supportsOnRename).toBe(false);
    expect(subject.supportsOnBookRetag).toBe(false);
  });

  it("test() surfaces the proxy's validation failure", async () => {
    const test = vi.fn(async () => ({ propertyName: "Host", errorMessage: "bad host" }));
    const subject = buildSubject({ sendNotification: vi.fn(), test });

    const result = await subject.test();

    expect(result.isValid).toBe(false);
    expect(result.errors).toEqual([{ propertyName: "Host", errorMessage: "bad host" }]);
  });
});

import { describe, expect, it, vi } from "vitest";
import { createNotificationDefinition } from "../../NotificationDefinition.js";
import { Mailgun } from "../../mailgun/Mailgun.js";
import { createMailgunSettings } from "../../mailgun/MailgunSettings.js";
import type { IMailgunProxy } from "../../mailgun/MailgunProxy.js";

function buildMailgun(proxy: IMailgunProxy) {
  const mailgun = new Mailgun(proxy);
  mailgun.definition = createNotificationDefinition({
    settings: createMailgunSettings({
      apiKey: "key",
      from: "from@example.com",
      senderDomain: "mg.example.com",
      recipients: ["to@example.com"],
    }),
  });

  return mailgun;
}

describe("Mailgun notifier", () => {
  it("onGrab forwards the Book Grabbed title and message to the proxy", () => {
    const sendNotification = vi.fn(async () => {});
    const mailgun = buildMailgun({ sendNotification });

    mailgun.onGrab({ message: "Book X grabbed" } as never);

    expect(sendNotification).toHaveBeenCalledWith(
      "Book Grabbed",
      "Book X grabbed",
      expect.objectContaining({ apiKey: "key" })
    );
  });

  it("PRESERVED C# QUIRK: does not override OnDownloadFailure (falls through to the base no-op)", () => {
    const sendNotification = vi.fn(async () => {});
    const mailgun = buildMailgun({ sendNotification });

    void mailgun.onDownloadFailure({ message: "failed" } as never);

    expect(sendNotification).not.toHaveBeenCalled();
    expect(mailgun.supportsOnDownloadFailure).toBe(false);
  });

  it("PRESERVED C# QUIRK: does not override OnImportFailure (falls through to the base no-op)", () => {
    const sendNotification = vi.fn(async () => {});
    const mailgun = buildMailgun({ sendNotification });

    void mailgun.onImportFailure({ message: "failed" } as never);

    expect(sendNotification).not.toHaveBeenCalled();
    expect(mailgun.supportsOnImportFailure).toBe(false);
  });

  it("test() succeeds and logs on successful send", async () => {
    const sendNotification = vi.fn(async () => {});
    const mailgun = buildMailgun({ sendNotification });

    const result = await mailgun.test();

    expect(result.isValid).toBe(true);
    expect(sendNotification).toHaveBeenCalledWith(
      "Test Notification",
      "This is a test message from Readarr, though Mailgun.",
      expect.anything()
    );
  });

  it("test() fails when the proxy throws", async () => {
    const sendNotification = vi.fn(async () => {
      throw new Error("boom");
    });
    const mailgun = buildMailgun({ sendNotification });

    const result = await mailgun.test();

    expect(result.isValid).toBe(false);
    expect(result.errors[0]?.errorMessage).toBe("Unable to send test message though Mailgun.");
  });
});

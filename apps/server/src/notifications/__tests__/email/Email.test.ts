import { describe, expect, it, vi, beforeEach } from "vitest";

const sendMailMock = vi.fn(async () => ({ messageId: "test" }));
const closeMock = vi.fn();
const createTransportMock = vi.fn(() => ({ sendMail: sendMailMock, close: closeMock }));

vi.mock("nodemailer", () => ({
  default: { createTransport: (...args: unknown[]) => createTransportMock(...args) },
}));

const { Email } = await import("../../email/Email.js");
const { createEmailSettings } = await import("../../email/EmailSettings.js");
const { createNotificationDefinition } = await import("../../NotificationDefinition.js");
const { createAuthorDeleteMessage } = await import("../../AuthorDeleteMessage.js");
const { createBookDeleteMessage } = await import("../../BookDeleteMessage.js");

function fakeAuthor(name = "Brandon Sanderson") {
  return { id: 1, metadata: { id: 1, name } } as never;
}

function fakeBook(title = "The Way of Kings") {
  return { id: 1, title } as never;
}

function buildEmail(settingsOverrides = {}) {
  const email = new Email();
  email.definition = createNotificationDefinition({
    settings: createEmailSettings({
      server: "smtp.example.com",
      from: "from@example.com",
      to: ["to@example.com"],
      ...settingsOverrides,
    }),
  });

  return email;
}

describe("Email notifier", () => {
  beforeEach(() => {
    sendMailMock.mockClear();
    closeMock.mockClear();
    createTransportMock.mockClear();
  });

  it("onGrab sends an email with the branded Book Grabbed subject", async () => {
    const email = buildEmail();
    email.onGrab({ message: "Book X" } as never);

    await vi.waitFor(() => expect(sendMailMock).toHaveBeenCalledTimes(1));

    const call = sendMailMock.mock.calls[0]![0] as { subject: string; text: string };
    expect(call.subject).toBe("Readarr - Book Grabbed");
    expect(call.text).toBe("Book X sent to queue.");
  });

  it("onAuthorAdded uses the author's metadata name", async () => {
    const email = buildEmail();
    email.onAuthorAdded(fakeAuthor("Brandon Sanderson"));

    await vi.waitFor(() => expect(sendMailMock).toHaveBeenCalledTimes(1));

    const call = sendMailMock.mock.calls[0]![0] as { text: string };
    expect(call.text).toBe("Brandon Sanderson added to library.");
  });

  it("PRESERVED C# BUG: onBookDelete uses the Author Deleted subject, not Book Deleted", async () => {
    const email = buildEmail();
    const message = createBookDeleteMessage(fakeBook(), true);

    email.onBookDelete(message);

    await vi.waitFor(() => expect(sendMailMock).toHaveBeenCalledTimes(1));

    const call = sendMailMock.mock.calls[0]![0] as { subject: string };
    expect(call.subject).toBe("Readarr - Author Deleted");
  });

  it("PRESERVED C# BUG: onBookFileDelete also uses the Author Deleted subject", async () => {
    const email = buildEmail();
    const message = {
      message: "File removed",
      book: fakeBook(),
      bookFile: {},
      reason: "Manual",
    } as never;

    email.onBookFileDelete(message);

    await vi.waitFor(() => expect(sendMailMock).toHaveBeenCalledTimes(1));

    const call = sendMailMock.mock.calls[0]![0] as { subject: string };
    expect(call.subject).toBe("Readarr - Author Deleted");
  });

  it("onAuthorDelete uses the correct Author Deleted subject and message", async () => {
    const email = buildEmail();
    const message = createAuthorDeleteMessage(
      fakeAuthor("Brandon Sanderson"),
      "Brandon Sanderson",
      true
    );

    email.onAuthorDelete(message);

    await vi.waitFor(() => expect(sendMailMock).toHaveBeenCalledTimes(1));

    const call = sendMailMock.mock.calls[0]![0] as { subject: string; text: string };
    expect(call.subject).toBe("Readarr - Author Deleted");
    expect(call.text).toBe("Brandon Sanderson - Author removed and all files were deleted");
  });

  it("selects secure:true only for port 465 with requireEncryption", async () => {
    const email = buildEmail({ requireEncryption: true, port: 465 });
    email.onGrab({ message: "x" } as never);

    await vi.waitFor(() => expect(createTransportMock).toHaveBeenCalledTimes(1));

    const options = createTransportMock.mock.calls[0]![0] as {
      secure: boolean;
      requireTLS: boolean;
    };
    expect(options.secure).toBe(true);
    expect(options.requireTLS).toBe(false);
  });

  it("selects requireTLS for any other port with requireEncryption", async () => {
    const email = buildEmail({ requireEncryption: true, port: 587 });
    email.onGrab({ message: "x" } as never);

    await vi.waitFor(() => expect(createTransportMock).toHaveBeenCalledTimes(1));

    const options = createTransportMock.mock.calls[0]![0] as {
      secure: boolean;
      requireTLS: boolean;
    };
    expect(options.secure).toBe(false);
    expect(options.requireTLS).toBe(true);
  });

  it("rejects an invalid From address before attempting to send", async () => {
    const email = buildEmail();
    const badSettings = createEmailSettings({
      server: "smtp.example.com",
      from: "not-an-email",
      to: ["to@example.com"],
    });

    const result = await email.testSettings(badSettings);

    expect(result).toEqual(expect.objectContaining({ propertyName: "Server" }));
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it("test() returns a failure when sending throws", async () => {
    sendMailMock.mockRejectedValueOnce(new Error("connection refused"));

    const email = buildEmail();
    const result = await email.test();

    expect(result.isValid).toBe(false);
    expect(result.errors[0]?.errorMessage).toBe("Unable to send test email");
  });

  it("test() succeeds when sending resolves", async () => {
    const email = buildEmail();
    const result = await email.test();

    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});

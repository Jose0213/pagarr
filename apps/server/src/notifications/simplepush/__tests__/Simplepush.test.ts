import { describe, expect, it, vi } from "vitest";
import { testAuthor } from "../../__tests__/testFixtures.js";
import type { NotificationDefinition } from "../../NotificationDefinition.js";
import { createNotificationDefinition } from "../../NotificationDefinition.js";
import { Simplepush } from "../Simplepush.js";
import { createSimplepushSettings } from "../SimplepushSettings.js";
import type { ISimplepushProxy } from "../SimplepushProxy.js";

function buildSubject(proxy: ISimplepushProxy) {
  const subject = new Simplepush(proxy);
  subject.definition = createNotificationDefinition<ReturnType<typeof createSimplepushSettings>>({
    id: 1,
    name: "Simplepush",
    implementationName: "Simplepush",
    implementation: "Simplepush",
    configContract: "SimplepushSettings",
    enable: true,
    settings: createSimplepushSettings({ key: "k" }),
  });
  return subject;
}

describe("Simplepush", () => {
  it("delegates every On* handler to proxy.sendNotification with the branded title constant", async () => {
    const sendNotification = vi.fn(async () => {});
    const subject = buildSubject({ sendNotification, test: vi.fn() });

    await subject.onBookFileDelete({
      message: "file deleted",
      book: { id: 1, title: "x" } as never,
      bookFile: { id: 1, path: "/x" } as never,
      reason: 0 as never,
    });
    expect(sendNotification).toHaveBeenLastCalledWith(
      "Book File Deleted",
      "file deleted",
      subject.definition.settings
    );

    await subject.onAuthorAdded(testAuthor({}, "Terry Pratchett"));
    expect(sendNotification).toHaveBeenLastCalledWith(
      "Author Added",
      "Terry Pratchett",
      subject.definition.settings
    );
  });

  it("supports exactly the events Simplepush.cs overrides (no OnRename/OnBookRetag)", () => {
    const subject = buildSubject({ sendNotification: vi.fn(), test: vi.fn() });
    expect(subject.supportsOnGrab).toBe(true);
    expect(subject.supportsOnRename).toBe(false);
    expect(subject.supportsOnBookRetag).toBe(false);
    expect(subject.supportsOnBookFileDelete).toBe(true);
  });

  it("test() surfaces the proxy's validation failure", async () => {
    const test = vi.fn(async () => ({ propertyName: "ApiKey", errorMessage: "bad key" }));
    const subject = buildSubject({ sendNotification: vi.fn(), test });

    const result = await subject.test();

    expect(result.isValid).toBe(false);
    expect(result.errors).toEqual([{ propertyName: "ApiKey", errorMessage: "bad key" }]);
  });
});

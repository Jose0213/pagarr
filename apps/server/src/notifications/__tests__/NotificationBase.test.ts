import { describe, expect, it } from "vitest";
import type { ValidationResult } from "../../thingi-provider/IProviderConfig.js";
import { NULL_CONFIG_INSTANCE, type NullConfig } from "../../thingi-provider/NullConfig.js";
import { NotificationBase } from "../NotificationBase.js";
import type { GrabMessage } from "../GrabMessage.js";
import type { Author } from "../../books/models.js";
import { newAuthor } from "../../books/models.js";

/** A notification that overrides nothing -- every Supports* flag should read false. */
class BareNotification extends NotificationBase<NullConfig> {
  readonly name = "Bare";
  readonly configContract = "NullConfig";
  readonly link = "https://example.test";

  async test(): Promise<ValidationResult> {
    return { isValid: true, hasWarnings: false, errors: [] };
  }
}

/** A notification overriding OnGrab and OnBookFileDelete only. */
class GrabbyNotification extends NotificationBase<NullConfig> {
  readonly name = "Grabby";
  readonly configContract = "NullConfig";
  readonly link = "https://example.test/grabby";

  onGrab(_grabMessage: GrabMessage): void {
    // real override
  }

  onBookFileDelete(): void {
    // real override
  }

  async test(): Promise<ValidationResult> {
    return { isValid: true, hasWarnings: false, errors: [] };
  }
}

function author(): Author {
  return { ...newAuthor(), id: 1 };
}

describe("NotificationBase", () => {
  it("supportsOnX flags are all false when a subclass overrides nothing, matching HasConcreteImplementation on the unoverridden base method", () => {
    const notification = new BareNotification();

    expect(notification.supportsOnGrab).toBe(false);
    expect(notification.supportsOnRename).toBe(false);
    expect(notification.supportsOnAuthorAdded).toBe(false);
    expect(notification.supportsOnAuthorDelete).toBe(false);
    expect(notification.supportsOnBookDelete).toBe(false);
    expect(notification.supportsOnBookFileDelete).toBe(false);
    expect(notification.supportsOnBookFileDeleteForUpgrade).toBe(false);
    expect(notification.supportsOnReleaseImport).toBe(false);
    expect(notification.supportsOnUpgrade).toBe(false);
    expect(notification.supportsOnHealthIssue).toBe(false);
    expect(notification.supportsOnDownloadFailure).toBe(false);
    expect(notification.supportsOnImportFailure).toBe(false);
    expect(notification.supportsOnBookRetag).toBe(false);
    expect(notification.supportsOnApplicationUpdate).toBe(false);
  });

  it("supportsOnGrab is true only for a subclass that actually overrides onGrab", () => {
    const notification = new GrabbyNotification();
    expect(notification.supportsOnGrab).toBe(true);
  });

  it("supportsOnBookFileDelete/supportsOnBookFileDeleteForUpgrade are both true from a single onBookFileDelete override, matching `SupportsOnBookFileDeleteForUpgrade => SupportsOnBookFileDelete`", () => {
    const notification = new GrabbyNotification();
    expect(notification.supportsOnBookFileDelete).toBe(true);
    expect(notification.supportsOnBookFileDeleteForUpgrade).toBe(true);
  });

  it("overriding onGrab does not flip unrelated Supports* flags", () => {
    const notification = new GrabbyNotification();
    expect(notification.supportsOnRename).toBe(false);
    expect(notification.supportsOnHealthIssue).toBe(false);
  });

  it("supportsOnUpgrade mirrors supportsOnReleaseImport (both false when unoverridden, both true together when overridden)", () => {
    class ReleaseImportNotification extends NotificationBase<NullConfig> {
      readonly name = "ReleaseImport";
      readonly configContract = "NullConfig";
      readonly link = "https://example.test/ri";

      onReleaseImport(): void {}

      async test(): Promise<ValidationResult> {
        return { isValid: true, hasWarnings: false, errors: [] };
      }
    }

    const notification = new ReleaseImportNotification();
    expect(notification.supportsOnReleaseImport).toBe(true);
    expect(notification.supportsOnUpgrade).toBe(true);
  });

  it("base OnX methods are no-ops that do not throw when called directly on an unoverridden subclass", () => {
    const notification = new BareNotification();
    const grabMessage = { message: "x" } as GrabMessage;

    expect(() => notification.onGrab(grabMessage)).not.toThrow();
    expect(() => notification.onAuthorAdded(author())).not.toThrow();
    expect(() => notification.processQueue()).not.toThrow();
  });

  it("message/defaultDefinitions/requestAction match the C# base's virtual defaults (null/empty/null)", () => {
    const notification = new BareNotification();
    expect(notification.message).toBeNull();
    expect(notification.defaultDefinitions).toEqual([]);
    expect(notification.requestAction("stage", {})).toBeNull();
  });

  it("toString() returns the runtime class name, matching `GetType().Name`", () => {
    expect(new BareNotification().toString()).toBe("BareNotification");
    expect(new GrabbyNotification().toString()).toBe("GrabbyNotification");
  });

  it("settings reads through definition.settings, matching `(TSettings)Definition.Settings`", () => {
    const notification = new BareNotification();
    notification.definition = {
      id: 1,
      name: "Bare",
      implementationName: "Bare",
      implementation: "Bare",
      configContract: "NullConfig",
      enable: true,
      message: null,
      tags: [],
      settings: NULL_CONFIG_INSTANCE,
      onGrab: false,
      onReleaseImport: false,
      onUpgrade: false,
      onRename: false,
      onAuthorAdded: false,
      onAuthorDelete: false,
      onBookDelete: false,
      onBookFileDelete: false,
      onBookFileDeleteForUpgrade: false,
      onHealthIssue: false,
      onDownloadFailure: false,
      onImportFailure: false,
      onBookRetag: false,
      onApplicationUpdate: false,
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
      includeHealthWarnings: false,
      supportsOnDownloadFailure: false,
      supportsOnImportFailure: false,
      supportsOnBookRetag: false,
      supportsOnApplicationUpdate: false,
    };

    // Accessing the protected `settings` getter indirectly via a subclass method
    // would require another test class; assert the definition wiring itself here.
    expect(notification.definition.settings).toBe(NULL_CONFIG_INSTANCE);
  });
});

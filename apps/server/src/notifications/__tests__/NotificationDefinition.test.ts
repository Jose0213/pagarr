import { describe, expect, it } from "vitest";
import {
  computeNotificationDefinitionEnable,
  createNotificationDefinition,
} from "../NotificationDefinition.js";

describe("NotificationDefinition", () => {
  it("createNotificationDefinition() defaults every OnX/SupportsOnX flag to false, plus ProviderDefinition's own defaults", () => {
    const definition = createNotificationDefinition();

    expect(definition.id).toBe(0);
    expect(definition.tags).toEqual([]);
    expect(definition.onGrab).toBe(false);
    expect(definition.supportsOnGrab).toBe(false);
    expect(definition.includeHealthWarnings).toBe(false);
  });

  it("createNotificationDefinition() applies overrides on top of the defaults", () => {
    const definition = createNotificationDefinition({ onGrab: true, name: "Discord" });
    expect(definition.onGrab).toBe(true);
    expect(definition.name).toBe("Discord");
    expect(definition.onRename).toBe(false);
  });
});

describe("computeNotificationDefinitionEnable", () => {
  it("is false when every OnX flag is false", () => {
    expect(computeNotificationDefinitionEnable(createNotificationDefinition())).toBe(false);
  });

  it.each([
    "onGrab",
    "onReleaseImport",
    "onRename",
    "onAuthorAdded",
    "onAuthorDelete",
    "onBookDelete",
    "onBookFileDelete",
    "onBookFileDeleteForUpgrade",
    "onHealthIssue",
    "onDownloadFailure",
    "onImportFailure",
    "onBookRetag",
    "onApplicationUpdate",
  ] as const)("is true when only %s is set", (flag) => {
    const definition = createNotificationDefinition({ [flag]: true });
    expect(computeNotificationDefinitionEnable(definition)).toBe(true);
  });

  it("is true when OnUpgrade is set together with OnReleaseImport (the faithfully-preserved redundant sub-expression)", () => {
    const definition = createNotificationDefinition({ onReleaseImport: true, onUpgrade: true });
    expect(computeNotificationDefinitionEnable(definition)).toBe(true);
  });

  it("is true from OnReleaseImport alone even when OnUpgrade is false -- the `OnReleaseImport && OnUpgrade` term never actually gates anything, matching the real C# dead sub-expression", () => {
    const definition = createNotificationDefinition({ onReleaseImport: true, onUpgrade: false });
    expect(computeNotificationDefinitionEnable(definition)).toBe(true);
  });

  it("OnUpgrade alone (without OnReleaseImport) does NOT enable the definition -- the `&&` term is false, and OnUpgrade has no other path into the `||` chain", () => {
    const definition = createNotificationDefinition({ onUpgrade: true, onReleaseImport: false });
    expect(computeNotificationDefinitionEnable(definition)).toBe(false);
  });
});

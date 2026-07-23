import { describe, expect, it } from "vitest";
import { createEmailSettings, validateEmailSettings } from "../../email/EmailSettings.js";

describe("EmailSettings defaults", () => {
  it("defaults server to smtp.gmail.com and port to 587", () => {
    const settings = createEmailSettings();
    expect(settings.server).toBe("smtp.gmail.com");
    expect(settings.port).toBe(587);
    expect(settings.requireEncryption).toBe(false);
    expect(settings.attachFiles).toBe(false);
  });
});

describe("validateEmailSettings", () => {
  it("is valid with server/from/port and at least one of to/cc/bcc", () => {
    const settings = createEmailSettings({
      server: "smtp.example.com",
      from: "from@example.com",
      to: ["to@example.com"],
    });

    const result = validateEmailSettings(settings);
    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("requires port between 1 and 65535", () => {
    const settings = createEmailSettings({
      server: "smtp.example.com",
      from: "from@example.com",
      to: ["to@example.com"],
      port: 0,
    });

    const result = validateEmailSettings(settings);
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.propertyName === "port")).toBe(true);
  });

  it("requires at least one of to/cc/bcc -- passing only cc is enough", () => {
    const settings = createEmailSettings({
      server: "smtp.example.com",
      from: "from@example.com",
      cc: ["cc@example.com"],
    });

    const result = validateEmailSettings(settings);
    expect(result.isValid).toBe(true);
  });

  it("requires at least one of to/cc/bcc -- passing only bcc is enough", () => {
    const settings = createEmailSettings({
      server: "smtp.example.com",
      from: "from@example.com",
      bcc: ["bcc@example.com"],
    });

    const result = validateEmailSettings(settings);
    expect(result.isValid).toBe(true);
  });

  it("fails when none of to/cc/bcc are set (Unless-combinator ported faithfully)", () => {
    const settings = createEmailSettings({
      server: "smtp.example.com",
      from: "from@example.com",
    });

    const result = validateEmailSettings(settings);
    expect(result.isValid).toBe(false);
    expect(result.errors.map((e) => e.propertyName)).toEqual(
      expect.arrayContaining(["to", "cc", "bcc"])
    );
  });

  it("flags invalid email addresses in to/cc/bcc", () => {
    const settings = createEmailSettings({
      server: "smtp.example.com",
      from: "from@example.com",
      to: ["not-an-email"],
    });

    const result = validateEmailSettings(settings);
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.propertyName === "to")).toBe(true);
  });

  it("requires server and from to be non-empty", () => {
    const settings = createEmailSettings({ server: "", from: "", to: ["to@example.com"] });

    const result = validateEmailSettings(settings);
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.propertyName === "server")).toBe(true);
    expect(result.errors.some((e) => e.propertyName === "from")).toBe(true);
  });
});

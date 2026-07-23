import { describe, expect, it } from "vitest";
import { createSignalSettings, validateSignalSettings } from "../SignalSettings.js";

describe("SignalSettings", () => {
  it("requires host, port, senderNumber, receiverId", () => {
    const result = validateSignalSettings(createSignalSettings());
    expect(result.isValid).toBe(false);
    expect(result.errors.map((e) => e.propertyName)).toEqual([
      "Host",
      "Port",
      "SenderNumber",
      "ReceiverId",
    ]);
  });

  it("passes with all required fields set", () => {
    const result = validateSignalSettings(
      createSignalSettings({
        host: "localhost",
        port: 8080,
        senderNumber: "+15551234567",
        receiverId: "+15557654321",
      })
    );
    expect(result.isValid).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import {
  createPlexServerSettings,
  validatePlexServerSettings,
} from "../server/PlexServerSettings.js";

describe("validatePlexServerSettings", () => {
  it("is valid for default settings with a host set", () => {
    const settings = createPlexServerSettings({ host: "plex.local" });
    expect(validatePlexServerSettings(settings).isValid).toBe(true);
  });

  it("rejects an empty host", () => {
    const settings = createPlexServerSettings({ host: "" });
    const result = validatePlexServerSettings(settings);
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.propertyName === "Host")).toBe(true);
  });

  it("rejects a port outside [1, 65535]", () => {
    const settings = createPlexServerSettings({ host: "plex.local", port: 0 });
    expect(validatePlexServerSettings(settings).isValid).toBe(false);

    const tooHigh = createPlexServerSettings({ host: "plex.local", port: 70000 });
    expect(validatePlexServerSettings(tooHigh).isValid).toBe(false);
  });

  it("requires mapTo when mapFrom is set (Unless MapTo is blank)", () => {
    const settings = createPlexServerSettings({ host: "plex.local", mapFrom: "/data" });
    const result = validatePlexServerSettings(settings);
    expect(result.errors.some((e) => e.propertyName === "MapTo")).toBe(true);
  });

  it("requires mapFrom when mapTo is set (Unless MapFrom is blank)", () => {
    const settings = createPlexServerSettings({ host: "plex.local", mapTo: "/mnt" });
    const result = validatePlexServerSettings(settings);
    expect(result.errors.some((e) => e.propertyName === "MapFrom")).toBe(true);
  });

  it("is valid when both mapFrom and mapTo are set", () => {
    const settings = createPlexServerSettings({
      host: "plex.local",
      mapFrom: "/data",
      mapTo: "/mnt",
    });
    expect(validatePlexServerSettings(settings).isValid).toBe(true);
  });

  it("is valid when neither mapFrom nor mapTo is set", () => {
    const settings = createPlexServerSettings({ host: "plex.local" });
    expect(validatePlexServerSettings(settings).isValid).toBe(true);
  });

  it("default ctor values match the real C# defaults (Port 32400, UpdateLibrary true, SignIn startOAuth)", () => {
    const settings = createPlexServerSettings();
    expect(settings.port).toBe(32400);
    expect(settings.updateLibrary).toBe(true);
    expect(settings.signIn).toBe("startOAuth");
  });
});

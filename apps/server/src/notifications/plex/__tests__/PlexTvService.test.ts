import { describe, expect, it, vi } from "vitest";
import { PlexTvService } from "../plextv/PlexTvService.js";
import type { IPlexTvProxy } from "../plextv/PlexTvProxy.js";

function fakeProxy(overrides: Partial<IPlexTvProxy> = {}): IPlexTvProxy {
  return {
    getAuthToken: vi.fn(async () => "token"),
    ping: vi.fn(async () => true),
    ...overrides,
  };
}

describe("PlexTvService.ping 24h suppression cache", () => {
  it("pings the proxy on first call for a token", async () => {
    const proxy = fakeProxy();
    const service = new PlexTvService(
      proxy,
      { plexClientIdentifier: "client-1" },
      {
        appName: "Pagarr",
        version: "1.0",
        versionShort: "1.0",
      }
    );

    await service.ping("auth-token-1");

    expect(proxy.ping).toHaveBeenCalledTimes(1);
    expect(proxy.ping).toHaveBeenCalledWith("client-1", "auth-token-1");
  });

  it("does not re-ping the same token within 24 hours", async () => {
    const proxy = fakeProxy();
    let now = 0;
    const service = new PlexTvService(
      proxy,
      { plexClientIdentifier: "client-1" },
      { appName: "Pagarr", version: "1.0", versionShort: "1.0" },
      () => now
    );

    await service.ping("auth-token-1");
    now += 23 * 60 * 60 * 1000; // +23h
    await service.ping("auth-token-1");

    expect(proxy.ping).toHaveBeenCalledTimes(1);
  });

  it("re-pings after the 24h window elapses", async () => {
    const proxy = fakeProxy();
    let now = 0;
    const service = new PlexTvService(
      proxy,
      { plexClientIdentifier: "client-1" },
      { appName: "Pagarr", version: "1.0", versionShort: "1.0" },
      () => now
    );

    await service.ping("auth-token-1");
    now += 25 * 60 * 60 * 1000; // +25h
    await service.ping("auth-token-1");

    expect(proxy.ping).toHaveBeenCalledTimes(2);
  });

  it("tracks the suppression window independently per auth token", async () => {
    const proxy = fakeProxy();
    const service = new PlexTvService(
      proxy,
      { plexClientIdentifier: "client-1" },
      {
        appName: "Pagarr",
        version: "1.0",
        versionShort: "1.0",
      }
    );

    await service.ping("token-a");
    await service.ping("token-b");

    expect(proxy.ping).toHaveBeenCalledTimes(2);
  });
});

describe("PlexTvService.getPinUrl", () => {
  it("builds a POST request to plex.tv/api/v2/pins with the client identifier query param", () => {
    const service = new PlexTvService(
      fakeProxy(),
      { plexClientIdentifier: "abc-123" },
      {
        appName: "Pagarr",
        version: "1.0",
        versionShort: "1.0",
      }
    );

    const result = service.getPinUrl();

    expect(result.method).toBe("POST");
    expect(result.url).toContain("plex.tv/api/v2/pins");
    expect(result.url).toContain("X-Plex-Client-Identifier=abc-123");
  });
});

describe("PlexTvService.getSignInUrl", () => {
  it("returns the pin id passed through unchanged", () => {
    const service = new PlexTvService(
      fakeProxy(),
      { plexClientIdentifier: "abc-123" },
      {
        appName: "Pagarr",
        version: "1.0",
        versionShort: "1.0",
      }
    );

    const result = service.getSignInUrl("https://example.com/callback", 42, "ABCD");

    expect(result.pinId).toBe(42);
    // "hashBang" is a placeholder token in the base URL, rewritten to "#!"
    // via the segment substitution -- see getSignInUrl's doc comment.
    expect(result.oauthUrl).toContain("app.plex.tv/auth/#!");
    expect(result.oauthUrl).not.toContain("hashBang");
    expect(result.oauthUrl).toContain("code=ABCD");
  });
});

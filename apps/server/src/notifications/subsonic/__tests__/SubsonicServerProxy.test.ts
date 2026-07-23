import { describe, expect, it, vi } from "vitest";
import { SubsonicServerProxy } from "../SubsonicServerProxy.js";
import { SubsonicAuthenticationException, SubsonicException } from "../SubsonicException.js";
import { createSubsonicSettings } from "../SubsonicSettings.js";
import { HttpHeader } from "../../../http/HttpHeader.js";
import { HttpResponse } from "../../../http/HttpResponse.js";
import { HttpRequest } from "../../../http/HttpRequest.js";
import type { IHttpClient } from "../../../http/HttpClient.js";
import { noopLogger } from "../../__tests__/testFixtures.js";

function fakeHttpClient(content: string): IHttpClient {
  const request = new HttpRequest("http://subsonic.local:4040/rest/ping");
  const response = new HttpResponse(
    request,
    new HttpHeader(),
    new TextEncoder().encode(content),
    200
  );
  return {
    execute: vi.fn(async () => response),
    get: vi.fn(async () => response),
    getTyped: vi.fn(async () => {
      throw new Error("not used");
    }),
    head: vi.fn(async () => response),
    post: vi.fn(async () => response),
    postTyped: vi.fn(async () => {
      throw new Error("not used");
    }),
    downloadFile: vi.fn(async () => {}),
  };
}

const settings = createSubsonicSettings({ host: "subsonic.local", port: 4040 });

describe("SubsonicServerProxy.version / checkForError", () => {
  it("returns the version attribute on a successful subsonic-response", async () => {
    const client = fakeHttpClient(
      `<subsonic-response xmlns="http://subsonic.org/restapi" status="ok" version="1.15.0"></subsonic-response>`
    );
    const proxy = new SubsonicServerProxy(client, noopLogger());

    expect(await proxy.version(settings)).toBe("1.15.0");
  });

  it("throws SubsonicException when the response has no status attribute", async () => {
    const client = fakeHttpClient(`<not-subsonic></not-subsonic>`);
    const proxy = new SubsonicServerProxy(client, noopLogger());

    await expect(proxy.version(settings)).rejects.toThrow(SubsonicException);
  });

  it("throws SubsonicAuthenticationException for error code 40 (wrong credentials)", async () => {
    const client = fakeHttpClient(
      `<subsonic-response xmlns="http://subsonic.org/restapi" status="failed"><error code="40" message="Wrong username or password"/></subsonic-response>`
    );
    const proxy = new SubsonicServerProxy(client, noopLogger());

    await expect(proxy.version(settings)).rejects.toThrow(SubsonicAuthenticationException);
  });

  it("throws a plain SubsonicException for other error codes", async () => {
    const client = fakeHttpClient(
      `<subsonic-response xmlns="http://subsonic.org/restapi" status="failed"><error code="70" message="Something else broke"/></subsonic-response>`
    );
    const proxy = new SubsonicServerProxy(client, noopLogger());

    await expect(proxy.version(settings)).rejects.toThrow("Something else broke");
  });

  it("throws SubsonicException with a generic message when status=failed but no error element/code is present", async () => {
    const client = fakeHttpClient(
      `<subsonic-response xmlns="http://subsonic.org/restapi" status="failed"></subsonic-response>`
    );
    const proxy = new SubsonicServerProxy(client, noopLogger());

    await expect(proxy.version(settings)).rejects.toThrow(
      "Subsonic returned error, check settings"
    );
  });
});

describe("SubsonicServerProxy.getBaseUrl", () => {
  it("builds a base URL from host/port/urlBase", () => {
    const client = fakeHttpClient("");
    const proxy = new SubsonicServerProxy(client, noopLogger());

    const url = proxy.getBaseUrl(settings);
    expect(url).toContain("subsonic.local");
    expect(url).toContain("4040");
  });
});

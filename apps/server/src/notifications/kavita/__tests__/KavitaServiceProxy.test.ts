import { describe, expect, it, vi } from "vitest";
import { KavitaServiceProxy } from "../KavitaServiceProxy.js";
import { KavitaException } from "../KavitaException.js";
import { createKavitaSettings } from "../KavitaSettings.js";
import { HttpHeader } from "../../../http/HttpHeader.js";
import { HttpResponse } from "../../../http/HttpResponse.js";
import { HttpRequest } from "../../../http/HttpRequest.js";
import type { IHttpClient } from "../../../http/HttpClient.js";
import { noopLogger } from "../../__tests__/testFixtures.js";

const buildInfo = { appName: "Pagarr", version: "1.0", versionShort: "1.0" };
const settings = createKavitaSettings({ host: "kavita.local", port: 5000, apiKey: "key" });

function fakeHttpClient(responseContent: string): IHttpClient {
  const request = new HttpRequest("http://kavita.local:5000/api/library/scan-folder");
  const response = new HttpResponse(
    request,
    new HttpHeader(),
    new TextEncoder().encode(responseContent),
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

describe("KavitaServiceProxy.notify", () => {
  it("doubles every forward slash in the folder path (ported quirk from folderPath.Replace('/', '//'))", async () => {
    const client = fakeHttpClient("");
    const postSpy = client.post as ReturnType<typeof vi.fn>;
    const proxy = new KavitaServiceProxy(client, buildInfo, noopLogger());

    await proxy.notify(settings, "/library/Author/Book");

    const sentRequest = postSpy.mock.calls[0]![0] as HttpRequest;
    const body = JSON.parse(
      sentRequest.contentData ? Buffer.from(sentRequest.contentData).toString("utf8") : "{}"
    ) as {
      FolderPath: string;
    };

    expect(body.FolderPath).toBe("//library//Author//Book");
  });
});

describe("KavitaServiceProxy.getToken", () => {
  it("returns the token from a successful authenticate response", async () => {
    const client = fakeHttpClient(JSON.stringify({ token: "jwt-token", apiKey: "key" }));
    const proxy = new KavitaServiceProxy(client, buildInfo, noopLogger());

    expect(await proxy.getToken(settings)).toBe("jwt-token");
  });

  it("throws KavitaException when the response cannot be parsed as an auth result", async () => {
    const client = fakeHttpClient("not json");
    const proxy = new KavitaServiceProxy(client, buildInfo, noopLogger());

    await expect(proxy.getToken(settings)).rejects.toThrow(KavitaException);
  });
});

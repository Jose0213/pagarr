import { describe, expect, it, vi } from "vitest";
import { HttpHeader } from "../../../http/HttpHeader.js";
import { HttpResponse } from "../../../http/HttpResponse.js";
import type { IHttpClient } from "../../../http/HttpClient.js";
import { readFixture } from "../../__tests__/testFixtures.js";
import { NewznabCapabilitiesProvider } from "../NewznabCapabilitiesProvider.js";
import { createNewznabSettings } from "../newznabSettings.js";

function httpClientReturning(content: string): {
  client: IHttpClient;
  get: ReturnType<typeof vi.fn>;
} {
  const get = vi.fn(async (request) => new HttpResponse(request, new HttpHeader(), content, 200));
  const client = {
    execute: get,
    get,
    head: vi.fn(),
    post: vi.fn(),
    getTyped: vi.fn(),
    postTyped: vi.fn(),
    downloadFile: vi.fn(),
  } as unknown as IHttpClient;
  return { client, get };
}

describe("NewznabCapabilitiesProvider", () => {
  const settings = createNewznabSettings({ baseUrl: "http://indxer.local" });
  const capsXml = readFixture("newznab_caps.xml");

  it("does not request the same capabilities twice (caches per-settings)", async () => {
    const { client, get } = httpClientReturning(capsXml);
    const provider = new NewznabCapabilitiesProvider(client);

    await provider.getCapabilities(settings);
    await provider.getCapabilities(settings);

    expect(get).toHaveBeenCalledTimes(1);
  });

  it("reports the page size limits from the caps xml", async () => {
    const { client } = httpClientReturning(capsXml);
    const provider = new NewznabCapabilitiesProvider(client);

    const caps = await provider.getCapabilities(settings);

    expect(caps.defaultPageSize).toBe(25);
    expect(caps.maxPageSize).toBe(60);
  });

  it("uses the default page size if the <limits> element is missing", async () => {
    const { client } = httpClientReturning(capsXml.replace("<limits", "<abclimits"));
    const provider = new NewznabCapabilitiesProvider(client);

    const caps = await provider.getCapabilities(settings);

    expect(caps.defaultPageSize).toBe(100);
    expect(caps.maxPageSize).toBe(100);
  });

  it("propagates the error if the HTTP request itself fails", async () => {
    const client = {
      execute: vi.fn(),
      get: vi.fn().mockRejectedValue(new Error("network down")),
      head: vi.fn(),
      post: vi.fn(),
      getTyped: vi.fn(),
      postTyped: vi.fn(),
      downloadFile: vi.fn(),
    } as unknown as IHttpClient;

    const provider = new NewznabCapabilitiesProvider(client);

    await expect(provider.getCapabilities(settings)).rejects.toThrow("network down");
  });

  it("throws when the response XML is malformed", async () => {
    const { client } = httpClientReturning(capsXml.replace("<limits", "<>"));
    const provider = new NewznabCapabilitiesProvider(client);

    await expect(provider.getCapabilities(settings)).rejects.toThrow();
  });

  it("does not throw on unexpected xml data, falling back to defaults for that field", async () => {
    const { client } = httpClientReturning(capsXml.replace("3040", "asdf"));
    const provider = new NewznabCapabilitiesProvider(client);

    const result = await provider.getCapabilities(settings);

    expect(result).toBeDefined();
  });

  it("parses categories and subcategories from the caps xml", async () => {
    const { client } = httpClientReturning(capsXml);
    const provider = new NewznabCapabilitiesProvider(client);

    const caps = await provider.getCapabilities(settings);

    expect(caps.categories.map((c) => c.id)).toEqual([3000, 7000, 8000]);
    const audio = caps.categories.find((c) => c.id === 3000)!;
    expect(audio.subcategories.map((s) => s.id)).toEqual([3010, 3020, 3030, 3040]);
  });
});

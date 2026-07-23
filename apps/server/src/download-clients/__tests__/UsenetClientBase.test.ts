import { describe, expect, it, vi } from "vitest";
import { HttpHeader } from "../../http/HttpHeader.js";
import { HttpException } from "../../http/HttpException.js";
import { HttpRequest } from "../../http/HttpRequest.js";
import { HttpResponse } from "../../http/HttpResponse.js";
import { createDownloadClientDefinition } from "../DownloadClientDefinition.js";
import { ReleaseDownloadException, ReleaseUnavailableException } from "../TorrentClientBase.js";
import { UsenetClientBase, type IValidateNzbs } from "../UsenetClientBase.js";
import type { RemoteBookLike } from "../RemoteBookLike.js";
import type { DownloadClientItem } from "../DownloadClientItem.js";
import type { DownloadClientInfo } from "../DownloadClientInfo.js";
import {
  fakeConfigService,
  fakeDiskProvider,
  fakeHttpClient,
  createTestRemoteBook,
} from "./testFixtures.js";
import { identityRemotePathMappingService } from "../RemotePathMappingService.js";

interface TestSettings {
  validate: () => { isValid: boolean; hasWarnings: boolean; errors: never[] };
}

class TestUsenetClient extends UsenetClientBase<TestSettings> {
  readonly name = "TestUsenet";

  addFromNzbCalls: { filename: string; length: number }[] = [];

  protected addFromNzbFile(_remoteBook: RemoteBookLike, filename: string, fileContent: Uint8Array) {
    this.addFromNzbCalls.push({ filename, length: fileContent.length });
    return "nzb-id-1";
  }

  getItems(): DownloadClientItem[] {
    return [];
  }

  removeItem(): void {}

  getStatus(): DownloadClientInfo {
    return { isLocalhost: true, removesCompletedDownloads: false, outputRootFolders: [] };
  }

  protected async testConnection(): Promise<void> {}
}

function buildClient(
  overrides: {
    httpImpl?: Parameters<typeof fakeHttpClient>[0];
    nzbValidator?: IValidateNzbs;
  } = {}
) {
  const httpClient = fakeHttpClient(overrides.httpImpl);
  const client = new TestUsenetClient(
    httpClient,
    fakeConfigService(),
    fakeDiskProvider(),
    identityRemotePathMappingService,
    overrides.nzbValidator
  );
  client.definition = createDownloadClientDefinition({
    id: 1,
    name: "TestUsenet",
    implementation: "Test",
  });
  return { client, httpClient };
}

describe("UsenetClientBase", () => {
  it("downloads the .nzb and calls addFromNzbFile with a cleaned filename", async () => {
    const nzbBytes = new TextEncoder().encode("<nzb></nzb>");
    const { client } = buildClient({
      httpImpl: {
        get: vi.fn(async (req) => new HttpResponse(req, new HttpHeader(), nzbBytes, 200)),
      },
    });

    const remoteBook = createTestRemoteBook();
    const id = await client.download(remoteBook, null);

    expect(id).toBe("nzb-id-1");
    expect(client.addFromNzbCalls).toHaveLength(1);
    expect(client.addFromNzbCalls[0]!.filename).toBe("Droned.S01E01.Pilot.1080p.WEB-DL-DRONE.nzb");
    expect(client.addFromNzbCalls[0]!.length).toBe(nzbBytes.length);
  });

  it("runs the nzb through the validator before adding", async () => {
    const nzbBytes = new TextEncoder().encode("<nzb></nzb>");
    const validate = vi.fn();
    const { client } = buildClient({
      httpImpl: {
        get: vi.fn(async (req) => new HttpResponse(req, new HttpHeader(), nzbBytes, 200)),
      },
      nzbValidator: { validate },
    });

    await client.download(createTestRemoteBook(), null);

    expect(validate).toHaveBeenCalledTimes(1);
    expect(validate.mock.calls[0]![0]).toBe("Droned.S01E01.Pilot.1080p.WEB-DL-DRONE.nzb");
  });

  it("propagates a validator rejection instead of adding the file", async () => {
    const nzbBytes = new TextEncoder().encode("not an nzb");
    const { client } = buildClient({
      httpImpl: {
        get: vi.fn(async (req) => new HttpResponse(req, new HttpHeader(), nzbBytes, 200)),
      },
      nzbValidator: {
        validate: () => {
          throw new Error("Invalid NZB");
        },
      },
    });

    await expect(client.download(createTestRemoteBook(), null)).rejects.toThrow("Invalid NZB");
    expect(client.addFromNzbCalls).toHaveLength(0);
  });

  it("throws ReleaseUnavailableException on a 404", async () => {
    const { client } = buildClient({
      httpImpl: {
        get: vi.fn(async (req) => {
          const response = new HttpResponse(req, new HttpHeader(), new Uint8Array(), 404);
          throw new HttpException(req, response);
        }),
      },
    });

    await expect(client.download(createTestRemoteBook(), null)).rejects.toThrow(
      ReleaseUnavailableException
    );
  });

  it("throws ReleaseDownloadException on other HTTP failures (retrying twice on 5xx first)", async () => {
    vi.useFakeTimers();
    try {
      const { client, httpClient } = buildClient({
        httpImpl: {
          get: vi.fn(async (req) => {
            const response = new HttpResponse(req, new HttpHeader(), new Uint8Array(), 503);
            throw new HttpException(req, response);
          }),
        },
      });

      const promise = client.download(createTestRemoteBook(), null);
      const assertion = expect(promise).rejects.toThrow(ReleaseDownloadException);

      await vi.advanceTimersByTimeAsync(15000);

      await assertion;
      expect(httpClient.get).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  }, 10000);

  it("uses the indexer's download request when an indexer is supplied", async () => {
    const nzbBytes = new TextEncoder().encode("<nzb></nzb>");
    const getRequest = vi.fn((link: string) => new HttpRequest(link));
    const { client, httpClient } = buildClient({
      httpImpl: {
        get: vi.fn(async (req) => new HttpResponse(req, new HttpHeader(), nzbBytes, 200)),
      },
    });

    const indexer = {
      getDownloadRequest: getRequest,
    } as unknown as Parameters<typeof client.download>[1];

    await client.download(createTestRemoteBook(), indexer);

    expect(getRequest).toHaveBeenCalledTimes(1);
    expect(httpClient.get).toHaveBeenCalledTimes(1);
  });
});

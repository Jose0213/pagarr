import { describe, expect, it, vi } from "vitest";
import { createDownloadClientDefinition } from "../DownloadClientDefinition.js";
import { createDownloadClientStatus } from "../DownloadClientStatus.js";
import { DownloadClientFactory } from "../DownloadClientFactory.js";
import type { IDownloadClient } from "../IDownloadClient.js";
import type { IDownloadClientStatusService } from "../DownloadClientStatusService.js";
import { DownloadProtocol } from "../../indexers/DownloadProtocol.js";

function fakeClient(
  id: number,
  enabled: boolean,
  protocol: DownloadProtocol = DownloadProtocol.Torrent
): IDownloadClient {
  return {
    name: `Client${id}`,
    protocol,
    definition: createDownloadClientDefinition({ id, name: `Client${id}`, enable: enabled }),
    download: vi.fn(),
    getItems: vi.fn(() => []),
    getImportItem: vi.fn((item) => item),
    removeItem: vi.fn(),
    getStatus: vi.fn(),
    markItemAsImported: vi.fn(),
    test: vi.fn(async () => ({ isValid: true, hasWarnings: false, errors: [] })),
    requestAction: vi.fn(),
  };
}

function fakeStatusService(blocked: number[] = []): IDownloadClientStatusService {
  return {
    getBlockedProviders: () => blocked.map((id) => createDownloadClientStatus({ providerId: id })),
    recordSuccess: vi.fn(),
    recordFailure: vi.fn(),
    recordConnectionFailure: vi.fn(),
  };
}

describe("DownloadClientFactory", () => {
  it("downloadHandlingEnabled() filters out disabled clients", () => {
    const clients = [fakeClient(1, true), fakeClient(2, false)];
    const factory = new DownloadClientFactory(fakeStatusService(), clients);

    const result = factory.downloadHandlingEnabled(false);
    expect(result.map((c) => c.definition.id)).toEqual([1]);
  });

  it("downloadHandlingEnabled() filters out blocked clients by default", () => {
    const clients = [fakeClient(1, true), fakeClient(2, true)];
    const factory = new DownloadClientFactory(fakeStatusService([2]), clients);

    const result = factory.downloadHandlingEnabled();
    expect(result.map((c) => c.definition.id)).toEqual([1]);
  });

  it("downloadHandlingEnabled(false) does not filter blocked clients", () => {
    const clients = [fakeClient(1, true), fakeClient(2, true)];
    const factory = new DownloadClientFactory(fakeStatusService([2]), clients);

    const result = factory.downloadHandlingEnabled(false);
    expect(result.map((c) => c.definition.id).sort()).toEqual([1, 2]);
  });

  it("setProviderCharacteristics() stamps protocol from the live provider onto the definition", () => {
    const client = fakeClient(1, true, DownloadProtocol.Usenet);
    const factory = new DownloadClientFactory(fakeStatusService(), [client]);
    const definition = createDownloadClientDefinition({ id: 1 });

    factory.setProviderCharacteristics(client, definition);

    expect(definition.protocol).toBe(DownloadProtocol.Usenet);
  });

  it("test() records success on the status service when the client's test passes", async () => {
    const client = fakeClient(1, true);
    const statusService = fakeStatusService();
    const factory = new DownloadClientFactory(statusService, [client]);

    const result = await factory.test(createDownloadClientDefinition({ id: 1 }));

    expect(result.isValid).toBe(true);
    expect(statusService.recordSuccess).toHaveBeenCalledWith(1);
  });

  it("test() records failure on the status service when the client's test fails", async () => {
    const client = fakeClient(1, true);
    client.test = vi.fn(async () => ({
      isValid: false,
      hasWarnings: false,
      errors: [{ propertyName: "Host", errorMessage: "bad" }],
    }));
    const statusService = fakeStatusService();
    const factory = new DownloadClientFactory(statusService, [client]);

    const result = await factory.test(createDownloadClientDefinition({ id: 1 }));

    expect(result.isValid).toBe(false);
    expect(statusService.recordFailure).toHaveBeenCalledWith(1);
  });

  it("test() does not record success/failure for a definition with id 0 (unsaved)", async () => {
    const client = fakeClient(1, true);
    const statusService = fakeStatusService();
    const factory = new DownloadClientFactory(statusService, [client]);

    await factory.test(createDownloadClientDefinition({ id: 0 }));

    expect(statusService.recordSuccess).not.toHaveBeenCalled();
    expect(statusService.recordFailure).not.toHaveBeenCalled();
  });
});

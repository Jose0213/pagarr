import { describe, expect, it, vi } from "vitest";
import { DownloadProtocol } from "../../indexers/DownloadProtocol.js";
import { createDownloadClientDefinition } from "../DownloadClientDefinition.js";
import { createDownloadClientStatus } from "../DownloadClientStatus.js";
import { DownloadClientProvider, type IndexerLookup } from "../DownloadClientProvider.js";
import { DownloadClientUnavailableException } from "../DownloadClientException.js";
import type { IDownloadClientFactory } from "../DownloadClientFactory.js";
import type { IDownloadClient } from "../IDownloadClient.js";
import type { IDownloadClientStatusService } from "../DownloadClientStatusService.js";

function fakeClient(
  id: number,
  overrides: Partial<ReturnType<typeof createDownloadClientDefinition>> = {},
  protocol: DownloadProtocol = DownloadProtocol.Torrent
): IDownloadClient {
  return {
    name: `Client${id}`,
    protocol,
    definition: createDownloadClientDefinition({
      id,
      name: `Client${id}`,
      enable: true,
      ...overrides,
    }),
    download: vi.fn(),
    getItems: vi.fn(() => []),
    getImportItem: vi.fn((item) => item),
    removeItem: vi.fn(),
    getStatus: vi.fn(),
    markItemAsImported: vi.fn(),
    test: vi.fn(),
    requestAction: vi.fn(),
  };
}

function fakeFactory(clients: IDownloadClient[]): IDownloadClientFactory {
  return {
    downloadHandlingEnabled: () => clients,
    setProviderCharacteristics: vi.fn(),
    test: vi.fn(),
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

function fakeIndexerLookup(
  map: Record<number, { downloadClientId: number; name: string }> = {}
): IndexerLookup {
  return { find: (id) => map[id] };
}

describe("DownloadClientProvider", () => {
  it("getDownloadClient() returns null when no client matches the protocol", () => {
    const provider = new DownloadClientProvider(
      fakeStatusService(),
      fakeFactory([fakeClient(1, {}, DownloadProtocol.Usenet)]),
      fakeIndexerLookup()
    );

    expect(provider.getDownloadClient(DownloadProtocol.Torrent)).toBeNull();
  });

  it("getDownloadClient() round-robins across same-priority clients by id", () => {
    const clients = [fakeClient(1), fakeClient(2)];
    const provider = new DownloadClientProvider(
      fakeStatusService(),
      fakeFactory(clients),
      fakeIndexerLookup()
    );

    const first = provider.getDownloadClient(DownloadProtocol.Torrent);
    const second = provider.getDownloadClient(DownloadProtocol.Torrent);
    const third = provider.getDownloadClient(DownloadProtocol.Torrent);

    expect(first!.definition.id).toBe(1);
    expect(second!.definition.id).toBe(2);
    expect(third!.definition.id).toBe(1);
  });

  it("getDownloadClient() prefers the lowest-priority group", () => {
    const clients = [fakeClient(1, { priority: 2 }), fakeClient(2, { priority: 1 })];
    const provider = new DownloadClientProvider(
      fakeStatusService(),
      fakeFactory(clients),
      fakeIndexerLookup()
    );

    const result = provider.getDownloadClient(DownloadProtocol.Torrent);
    expect(result!.definition.id).toBe(2);
  });

  it("getDownloadClient() honors an indexer's specified download client", () => {
    const clients = [fakeClient(1), fakeClient(2)];
    const provider = new DownloadClientProvider(
      fakeStatusService(),
      fakeFactory(clients),
      fakeIndexerLookup({ 5: { downloadClientId: 2, name: "MyIndexer" } })
    );

    const result = provider.getDownloadClient(DownloadProtocol.Torrent, 5);
    expect(result!.definition.id).toBe(2);
  });

  it("getDownloadClient() throws when the indexer's specified client doesn't exist", () => {
    const clients = [fakeClient(1)];
    const provider = new DownloadClientProvider(
      fakeStatusService(),
      fakeFactory(clients),
      fakeIndexerLookup({ 5: { downloadClientId: 999, name: "MyIndexer" } })
    );

    expect(() => provider.getDownloadClient(DownloadProtocol.Torrent, 5)).toThrow(
      DownloadClientUnavailableException
    );
  });

  it("getDownloadClient() filters by matching tags when tags are provided", () => {
    const clients = [fakeClient(1, { tags: [7] }), fakeClient(2, { tags: [] })];
    const provider = new DownloadClientProvider(
      fakeStatusService(),
      fakeFactory(clients),
      fakeIndexerLookup()
    );

    const result = provider.getDownloadClient(DownloadProtocol.Torrent, 0, false, new Set([7]));
    expect(result!.definition.id).toBe(1);
  });

  it("getDownloadClient() falls back to untagged clients when no tag matches", () => {
    const clients = [fakeClient(1, { tags: [9] }), fakeClient(2, { tags: [] })];
    const provider = new DownloadClientProvider(
      fakeStatusService(),
      fakeFactory(clients),
      fakeIndexerLookup()
    );

    const result = provider.getDownloadClient(DownloadProtocol.Torrent, 0, false, new Set([7]));
    expect(result!.definition.id).toBe(2);
  });

  it("getDownloadClient() throws when tags are provided and no client matches or is untagged", () => {
    const clients = [fakeClient(1, { tags: [9] })];
    const provider = new DownloadClientProvider(
      fakeStatusService(),
      fakeFactory(clients),
      fakeIndexerLookup()
    );

    expect(() =>
      provider.getDownloadClient(DownloadProtocol.Torrent, 0, false, new Set([7]))
    ).toThrow(DownloadClientUnavailableException);
  });

  it("getDownloadClient() skips blocked clients when filterBlockedClients is true", () => {
    const clients = [fakeClient(1), fakeClient(2)];
    const provider = new DownloadClientProvider(
      fakeStatusService([1]),
      fakeFactory(clients),
      fakeIndexerLookup()
    );

    const result = provider.getDownloadClient(DownloadProtocol.Torrent, 0, true);
    expect(result!.definition.id).toBe(2);
  });

  it("getDownloadClient() throws when every client is blocked and filterBlockedClients is true", () => {
    const clients = [fakeClient(1)];
    const provider = new DownloadClientProvider(
      fakeStatusService([1]),
      fakeFactory(clients),
      fakeIndexerLookup()
    );

    expect(() => provider.getDownloadClient(DownloadProtocol.Torrent, 0, true)).toThrow(
      DownloadClientUnavailableException
    );
  });

  it("get() returns the matching client by id", () => {
    const clients = [fakeClient(1), fakeClient(2)];
    const provider = new DownloadClientProvider(
      fakeStatusService(),
      fakeFactory(clients),
      fakeIndexerLookup()
    );

    expect(provider.get(2).definition.id).toBe(2);
  });

  it("get() throws for an unknown id", () => {
    const provider = new DownloadClientProvider(
      fakeStatusService(),
      fakeFactory([]),
      fakeIndexerLookup()
    );
    expect(() => provider.get(999)).toThrow();
  });

  it("getDownloadClients() filters blocked clients when requested", () => {
    const clients = [fakeClient(1), fakeClient(2)];
    const provider = new DownloadClientProvider(
      fakeStatusService([2]),
      fakeFactory(clients),
      fakeIndexerLookup()
    );

    expect(provider.getDownloadClients(true).map((c) => c.definition.id)).toEqual([1]);
    expect(
      provider
        .getDownloadClients(false)
        .map((c) => c.definition.id)
        .sort()
    ).toEqual([1, 2]);
  });
});

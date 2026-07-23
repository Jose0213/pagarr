import type { DownloadProtocol } from "../indexers/DownloadProtocol.js";
import { DownloadClientUnavailableException } from "./DownloadClientException.js";
import type { IDownloadClient } from "./IDownloadClient.js";
import type { IDownloadClientFactory } from "./DownloadClientFactory.js";
import type { IDownloadClientStatusService } from "./DownloadClientStatusService.js";

/**
 * Forward-ref for the slice of NzbDrone.Core/Indexers/IndexerFactory.cs (via
 * `IIndexerFactory`) `DownloadClientProvider.GetDownloadClient` calls:
 * `Find(indexerId)`, returning an object with `DownloadClientId`/`Name`.
 * Narrowed rather than importing the real `IIndexerFactory` (which returns
 * live `IIndexer` instances, not definitions, and has a much larger surface
 * this provider doesn't need) -- this is the exact same lookup shape
 * `decision-engine`'s specs narrow `IIndexerFactory` to (see
 * `decision-engine/remoteBook.ts`'s `IndexerFactoryLike`).
 */
export interface IndexerLookup {
  find(id: number): { downloadClientId: number; name: string } | undefined;
}

export interface IProvideDownloadClient {
  getDownloadClient(
    downloadProtocol: DownloadProtocol,
    indexerId?: number,
    filterBlockedClients?: boolean,
    tags?: Set<number>
  ): IDownloadClient | null;
  getDownloadClients(filterBlockedClients?: boolean): IDownloadClient[];
  get(id: number): IDownloadClient;
}

/** Minimal logger surface DownloadClientProvider needs. */
export interface DownloadClientProviderLogger {
  trace(message: string, ...args: unknown[]): void;
}

const noopLogger: DownloadClientProviderLogger = { trace: () => {} };

/**
 * Ported from NzbDrone.Core/Download/DownloadClientProvider.cs.
 *
 * DEVIATION -- caching: C#'s `ICacheManager.GetCache<int>(...,
 * "lastDownloadClientId")` (from the not-yet-ported Common.Cache module) is
 * really just a per-protocol "which client id did we use last time" counter
 * used to round-robin across same-priority clients -- not a TTL/perf cache
 * whose absence would change behavior, so it's ported here as a plain
 * in-memory `Map<DownloadProtocol, number>` on the instance rather than
 * pulled through `ICacheManager` (same "skip bespoke cache infra outside
 * this module's brief" precedent as `indexers/SeedConfigProvider.ts`'s doc
 * comment -- but unlike that TTL cache, this state has no expiry in the C#
 * original either, so a plain Map is a faithful port, not a narrowing).
 */
export class DownloadClientProvider implements IProvideDownloadClient {
  private readonly lastUsedDownloadClient = new Map<DownloadProtocol, number>();

  constructor(
    private readonly downloadClientStatusService: IDownloadClientStatusService,
    private readonly downloadClientFactory: IDownloadClientFactory,
    private readonly indexerFactory: IndexerLookup,
    private readonly logger: DownloadClientProviderLogger = noopLogger
  ) {}

  getDownloadClient(
    downloadProtocol: DownloadProtocol,
    indexerId = 0,
    filterBlockedClients = false,
    tags?: Set<number>
  ): IDownloadClient | null {
    const blockedProviders = new Set(
      this.downloadClientStatusService.getBlockedProviders().map((v) => v.providerId)
    );
    let availableProviders = this.downloadClientFactory
      .downloadHandlingEnabled(false)
      .filter((v) => v.protocol === downloadProtocol);

    if (availableProviders.length === 0) {
      return null;
    }

    if (tags && tags.size > 0) {
      const matchingTagsClients = availableProviders.filter((i) =>
        i.definition.tags.some((t) => tags.has(t))
      );

      availableProviders =
        matchingTagsClients.length > 0
          ? matchingTagsClients
          : availableProviders.filter((i) => i.definition.tags.length === 0);

      if (availableProviders.length === 0) {
        throw new DownloadClientUnavailableException(
          "No download client was found without tags or a matching author tag. Please check your settings."
        );
      }
    }

    if (indexerId > 0) {
      const indexer = this.indexerFactory.find(indexerId);

      if (indexer && indexer.downloadClientId > 0) {
        const client = availableProviders.find((d) => d.definition.id === indexer.downloadClientId);

        if (!client) {
          throw new DownloadClientUnavailableException(
            `Indexer specified download client does not exist for ${indexer.name}`
          );
        }

        if (filterBlockedClients && blockedProviders.has(client.definition.id)) {
          throw new DownloadClientUnavailableException(
            `Indexer specified download client is not available due to recent failures for ${indexer.name}`
          );
        }

        return client;
      }
    }

    if (blockedProviders.size > 0) {
      const nonBlockedProviders = availableProviders.filter(
        (v) => !blockedProviders.has(v.definition.id)
      );

      if (nonBlockedProviders.length > 0) {
        availableProviders = nonBlockedProviders;
      } else if (filterBlockedClients) {
        throw new DownloadClientUnavailableException(
          `All download clients for ${String(downloadProtocol)} are not available`
        );
      } else {
        this.logger.trace("No non-blocked Download Client available, retrying blocked one.");
      }
    }

    // Use the first priority clients first.
    const byPriority = new Map<number, IDownloadClient[]>();
    for (const provider of availableProviders) {
      const priority = provider.definition.priority;
      const list = byPriority.get(priority);
      if (list) {
        list.push(provider);
      } else {
        byPriority.set(priority, [provider]);
      }
    }
    const lowestPriority = Math.min(...byPriority.keys());
    availableProviders = byPriority
      .get(lowestPriority)!
      .sort((a, b) => a.definition.id - b.definition.id);

    const lastId = this.lastUsedDownloadClient.get(downloadProtocol) ?? 0;

    const provider =
      availableProviders.find((v) => v.definition.id > lastId) ?? availableProviders[0]!;

    this.lastUsedDownloadClient.set(downloadProtocol, provider.definition.id);

    return provider;
  }

  getDownloadClients(filterBlockedClients = false): IDownloadClient[] {
    const enabledClients = this.downloadClientFactory.downloadHandlingEnabled(false);

    if (filterBlockedClients) {
      return this.filterBlockedDownloadClients(enabledClients);
    }

    return enabledClients;
  }

  get(id: number): IDownloadClient {
    const client = this.downloadClientFactory
      .downloadHandlingEnabled(false)
      .find((d) => d.definition.id === id);

    if (!client) {
      throw new Error(`No download client found with id ${id}`);
    }

    return client;
  }

  private filterBlockedDownloadClients(clients: IDownloadClient[]): IDownloadClient[] {
    const blocked = new Map(
      this.downloadClientStatusService.getBlockedProviders().map((v) => [v.providerId, v])
    );

    const result: IDownloadClient[] = [];
    for (const client of clients) {
      const blockedClientStatus = blocked.get(client.definition.id);
      if (blockedClientStatus) {
        continue;
      }
      result.push(client);
    }
    return result;
  }
}

import type { IIndexerFactory } from "./IndexerFactory.js";
import type { IIndexer } from "./IIndexer.js";
import type { ReleaseInfo } from "./releaseInfo.js";

/** Minimal logger surface FetchAndParseRssService needs. */
export interface FetchAndParseRssLogger {
  warn(message: string, ...args: unknown[]): void;
  debug(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

const noopLogger: FetchAndParseRssLogger = { warn: () => {}, debug: () => {}, error: () => {} };

export interface IFetchAndParseRss {
  fetch(): Promise<ReleaseInfo[]>;
}

/** Ported from NzbDrone.Core/Indexers/FetchAndParseRssService.cs. */
export class FetchAndParseRssService implements IFetchAndParseRss {
  constructor(
    private readonly indexerFactory: IIndexerFactory,
    private readonly logger: FetchAndParseRssLogger = noopLogger
  ) {}

  async fetch(): Promise<ReleaseInfo[]> {
    const indexers = this.indexerFactory.rssEnabled();

    if (indexers.length === 0) {
      this.logger.warn("No available indexers. check your configuration.");
      return [];
    }

    this.logger.debug("Available indexers %d", indexers.length);

    const batch = await Promise.all(indexers.map((indexer) => this.fetchIndexer(indexer)));

    const result = batch.flat();

    this.logger.debug("Found %d reports", result.length);

    return result;
  }

  private async fetchIndexer(indexer: IIndexer): Promise<ReleaseInfo[]> {
    try {
      return await indexer.fetchRecent();
    } catch (ex) {
      this.logger.error("Error during RSS Sync: %s", ex);
    }

    return [];
  }
}

import { HttpAccept } from "../http/HttpAccept.js";
import type { IIndexerRequestGenerator } from "./IIndexerRequestGenerator.js";
import { IndexerPageableRequestChain } from "./IndexerPageableRequestChain.js";
import { IndexerRequest } from "./IndexerRequest.js";
import type { AuthorSearchCriteria, BookSearchCriteria } from "./searchCriteria.js";

/**
 * Ported from NzbDrone.Core/Indexers/RssIndexerRequestGenerator.cs. See
 * IIndexerRequestGenerator.ts's doc comment for why every method is async
 * here (C#'s originals are synchronous).
 */
export class RssIndexerRequestGenerator implements IIndexerRequestGenerator {
  constructor(private readonly baseUrl: string) {}

  async getRecentRequests(): Promise<IndexerPageableRequestChain> {
    const pageableRequests = new IndexerPageableRequestChain();

    pageableRequests.add([new IndexerRequest(this.baseUrl, HttpAccept.Rss)]);

    return pageableRequests;
  }

  getSearchRequests(searchCriteria: BookSearchCriteria): Promise<IndexerPageableRequestChain>;
  getSearchRequests(searchCriteria: AuthorSearchCriteria): Promise<IndexerPageableRequestChain>;
  getSearchRequests(
    _searchCriteria: BookSearchCriteria | AuthorSearchCriteria
  ): Promise<IndexerPageableRequestChain> {
    throw new Error("Not implemented");
  }
}

import type { IndexerPageableRequestChain } from "./IndexerPageableRequestChain.js";
import type { AuthorSearchCriteria, BookSearchCriteria } from "./searchCriteria.js";

/**
 * Ported from NzbDrone.Core/Indexers/IIndexerRequestGenerator.cs. C# overloads
 * `GetSearchRequests` by parameter type (`BookSearchCriteria` vs
 * `AuthorSearchCriteria`); TS interfaces support the same call-signature
 * overloading, so this is ported directly rather than renaming the methods.
 *
 * DEVIATION -- async: C#'s methods are synchronous (`IIndexerRequestGenerator`
 * has no `Task`-returning members). This port's `NewznabRequestGenerator`
 * (newznab/NewznabRequestGenerator.ts) needs to call the now-async
 * `INewznabCapabilitiesProvider.getCapabilities()` (itself async because
 * this port's `IHttpClient` is async-only -- see HttpClient.ts's doc
 * comment) while building requests, so every implementation in this module
 * is async and the interface is declared that way to match. Every caller
 * (HttpIndexerBase.fetchReleases, RssIndexerRequestGenerator) already
 * awaits generator output either way, so this is a signature-only ripple.
 */
export interface IIndexerRequestGenerator {
  getRecentRequests(): Promise<IndexerPageableRequestChain>;
  getSearchRequests(searchCriteria: BookSearchCriteria): Promise<IndexerPageableRequestChain>;
  getSearchRequests(searchCriteria: AuthorSearchCriteria): Promise<IndexerPageableRequestChain>;
}

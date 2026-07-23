import type { IndexerRequest } from "./IndexerRequest.js";

/**
 * Ported from NzbDrone.Core/Indexers/IndexerPageableRequest.cs. C#'s class
 * wraps an `IEnumerable<IndexerRequest>` and implements
 * `IEnumerable<IndexerRequest>` itself so callers can `foreach` it directly.
 * A thin array wrapper reproduces the same "iterate the requests" surface
 * (arrays are already iterable in TS, so this mostly exists for symmetry
 * with the C# type name at call sites, matching IndexerPageableRequestChain
 * below which stores `IndexerPageableRequest[]`).
 */
export class IndexerPageableRequest implements Iterable<IndexerRequest> {
  private readonly requests: readonly IndexerRequest[];

  constructor(requests: Iterable<IndexerRequest>) {
    this.requests = [...requests];
  }

  [Symbol.iterator](): Iterator<IndexerRequest> {
    return this.requests[Symbol.iterator]();
  }
}

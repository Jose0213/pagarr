import type { ImportListRequest } from "./ImportListRequest.js";

/**
 * Ported from NzbDrone.Core/ImportLists/ImportListPageableRequest.cs.
 *
 * C#'s class wraps an `IEnumerable<ImportListRequest>` and implements
 * `IEnumerable<ImportListRequest>` itself (a thin identity wrapper enabling
 * `foreach`). Ported as a class implementing the iterable protocol directly
 * over a plain array -- the C# source's own generator methods
 * (`GetPagedRequests()` in each concrete request generator) are ported as
 * plain generator functions/arrays rather than lazy `IEnumerable` chains
 * (see `LazyLibrarianImportRequestGenerator.ts`/`ReadarrRequestGenerator.ts`
 * for how each subclass supplies the underlying sequence), so this wrapper
 * just needs to make a `ImportListRequest[]` (or any `Iterable`) iterable
 * under this class's own type identity, matching how `HttpImportListBase`'s
 * `fetchReleases` iterates `pageableRequest` with a plain `for...of`.
 */
export class ImportListPageableRequest implements Iterable<ImportListRequest> {
  constructor(private readonly requests: Iterable<ImportListRequest>) {}

  [Symbol.iterator](): Iterator<ImportListRequest> {
    return this.requests[Symbol.iterator]();
  }
}

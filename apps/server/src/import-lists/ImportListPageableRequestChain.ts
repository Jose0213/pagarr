import { ImportListPageableRequest } from "./ImportListPageableRequest.js";
import type { ImportListRequest } from "./ImportListRequest.js";

/**
 * Ported from NzbDrone.Core/ImportLists/ImportListPageableRequestChain.cs.
 *
 * A "chain" of tiers, each tier holding zero or more pageable request
 * sequences. `add()` appends to the current (last) tier; `addTier()` starts
 * a fresh tier (but only if the current one is non-empty, matching the C#'s
 * `if (_chains.Last().Count == 0) return;` guard -- calling `addTier()`
 * twice in a row, or before ever calling `add()`, is a faithful no-op).
 */
export class ImportListPageableRequestChain {
  private readonly chains: ImportListPageableRequest[][] = [[]];

  get tiers(): number {
    return this.chains.length;
  }

  getAllTiers(): ImportListPageableRequest[] {
    return this.chains.flat();
  }

  getTier(index: number): ImportListPageableRequest[] {
    const tier = this.chains[index];
    if (tier === undefined) {
      throw new RangeError(`No such tier: ${index}`);
    }
    return tier;
  }

  /** Ported from Add(IEnumerable<ImportListRequest>): no-op if `request` is null/undefined. */
  add(request: Iterable<ImportListRequest> | null | undefined): void {
    if (request === null || request === undefined) {
      return;
    }

    this.chains[this.chains.length - 1]!.push(new ImportListPageableRequest(request));
  }

  addTier(request?: Iterable<ImportListRequest> | null): void {
    this.startNewTier();
    this.add(request ?? null);
  }

  private startNewTier(): void {
    if (this.chains[this.chains.length - 1]!.length === 0) {
      return;
    }

    this.chains.push([]);
  }
}

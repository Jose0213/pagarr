import { IndexerPageableRequest } from "./IndexerPageableRequest.js";
import type { IndexerRequest } from "./IndexerRequest.js";

/** Ported from NzbDrone.Core/Indexers/IndexerPageableRequestChain.cs. */
export class IndexerPageableRequestChain {
  private readonly chains: IndexerPageableRequest[][] = [[]];

  get tiers(): number {
    return this.chains.length;
  }

  getAllTiers(): IndexerPageableRequest[] {
    return this.chains.flat();
  }

  getTier(index: number): IndexerPageableRequest[] {
    const tier = this.chains[index];
    if (tier === undefined) {
      throw new RangeError(`Index out of range: ${index}`);
    }
    return tier;
  }

  add(request: Iterable<IndexerRequest> | null | undefined): void {
    if (request == null) {
      return;
    }

    this.chains[this.chains.length - 1]!.push(new IndexerPageableRequest(request));
  }

  addTier(request?: Iterable<IndexerRequest>): void {
    if (request === undefined) {
      // Ported from AddTier(): only start a new tier if the current one is
      // non-empty (matches "if (_chains.Last().Count == 0) return;").
      if (this.chains[this.chains.length - 1]!.length === 0) {
        return;
      }

      this.chains.push([]);
      return;
    }

    // Ported from AddTier(IEnumerable<IndexerRequest> request): AddTier(); Add(request);
    this.addTier();
    this.add(request);
  }
}

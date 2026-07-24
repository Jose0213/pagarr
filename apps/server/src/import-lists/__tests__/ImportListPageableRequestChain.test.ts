import { describe, expect, it } from "vitest";
import { ImportListPageableRequestChain } from "../ImportListPageableRequestChain.js";
import { ImportListRequest } from "../ImportListRequest.js";

function request(url: string): ImportListRequest {
  return new ImportListRequest(url);
}

describe("ImportListPageableRequestChain", () => {
  it("starts with exactly one (empty) tier", () => {
    const chain = new ImportListPageableRequestChain();

    expect(chain.tiers).toBe(1);
    expect(chain.getTier(0)).toEqual([]);
  });

  it("add() appends to the current (last) tier", () => {
    const chain = new ImportListPageableRequestChain();
    chain.add([request("http://a")]);
    chain.add([request("http://b")]);

    expect(chain.tiers).toBe(1);
    expect(chain.getTier(0)).toHaveLength(2);
  });

  it("add(null) is a no-op", () => {
    const chain = new ImportListPageableRequestChain();
    chain.add(null);
    chain.add(undefined);

    expect(chain.getTier(0)).toEqual([]);
  });

  it("addTier() starts a new tier only if the current one is non-empty", () => {
    const chain = new ImportListPageableRequestChain();

    // Current tier (0) is empty -- addTier() is a no-op.
    chain.addTier();
    expect(chain.tiers).toBe(1);

    chain.add([request("http://a")]);
    chain.addTier();
    expect(chain.tiers).toBe(2);

    // Calling addTier() again immediately (tier 1 still empty) is again a no-op.
    chain.addTier();
    expect(chain.tiers).toBe(2);
  });

  it("addTier(requests) starts a new tier and adds the given requests to it", () => {
    const chain = new ImportListPageableRequestChain();
    chain.add([request("http://a")]);
    chain.addTier([request("http://b")]);

    expect(chain.tiers).toBe(2);
    expect(chain.getTier(1)).toHaveLength(1);
  });

  it("getAllTiers() flattens every tier's pageable requests in order", () => {
    const chain = new ImportListPageableRequestChain();
    chain.add([request("http://a")]);
    chain.addTier([request("http://b")]);

    expect(chain.getAllTiers()).toHaveLength(2);
  });

  it("getTier() throws for an out-of-range index", () => {
    const chain = new ImportListPageableRequestChain();

    expect(() => chain.getTier(5)).toThrow();
  });
});

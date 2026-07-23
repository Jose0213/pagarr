import { describe, expect, it } from "vitest";
import { HttpAccept } from "../../http/HttpAccept.js";
import { IndexerPageableRequestChain } from "../IndexerPageableRequestChain.js";
import { IndexerRequest } from "../IndexerRequest.js";

function request(url: string): IndexerRequest {
  return new IndexerRequest(url, HttpAccept.Rss);
}

describe("IndexerPageableRequestChain", () => {
  it("starts with a single empty tier", () => {
    const chain = new IndexerPageableRequestChain();
    expect(chain.tiers).toBe(1);
    expect(chain.getAllTiers()).toHaveLength(0);
  });

  it("add() appends a pageable request to the current (last) tier", () => {
    const chain = new IndexerPageableRequestChain();
    chain.add([request("http://a"), request("http://b")]);

    expect(chain.tiers).toBe(1);
    expect(chain.getTier(0)).toHaveLength(1);
    expect([...chain.getTier(0)[0]!]).toHaveLength(2);
  });

  it("add(null/undefined) is a no-op", () => {
    const chain = new IndexerPageableRequestChain();
    chain.add(null);
    chain.add(undefined);
    expect(chain.getAllTiers()).toHaveLength(0);
  });

  it("addTier() only starts a new tier if the current tier is non-empty", () => {
    const chain = new IndexerPageableRequestChain();
    chain.addTier(); // no-op: current tier is empty
    expect(chain.tiers).toBe(1);

    chain.add([request("http://a")]);
    chain.addTier(); // now starts a new tier
    expect(chain.tiers).toBe(2);
  });

  it("addTier(requests) starts a new tier and adds to it in one call", () => {
    const chain = new IndexerPageableRequestChain();
    chain.add([request("http://a")]);
    chain.addTier([request("http://b")]);

    expect(chain.tiers).toBe(2);
    expect(chain.getTier(1)).toHaveLength(1);
  });

  it("getAllTiers() flattens every tier in order", () => {
    const chain = new IndexerPageableRequestChain();
    chain.add([request("http://a")]);
    chain.addTier([request("http://b")]);
    chain.add([request("http://c")]);

    expect(chain.getAllTiers()).toHaveLength(3);
  });

  it("getTier() throws for an out-of-range index", () => {
    const chain = new IndexerPageableRequestChain();
    expect(() => chain.getTier(5)).toThrow();
  });
});

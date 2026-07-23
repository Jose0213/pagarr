import { describe, expect, it, vi } from "vitest";
import { RemoteBookAggregationService } from "../remoteBookAggregationService.js";
import type { IAggregateRemoteBook } from "../aggregateRemoteBook.js";
import { newRemoteBook } from "../../../parser/model/remoteBook.js";
import { createDefaultAggregators } from "../aggregateRemoteBook.js";

describe("RemoteBookAggregationService", () => {
  it("calls aggregate() on every augmenter, in order", () => {
    const calls: string[] = [];
    const first: IAggregateRemoteBook = {
      aggregate: (rb) => {
        calls.push("first");
        return rb;
      },
    };
    const second: IAggregateRemoteBook = {
      aggregate: (rb) => {
        calls.push("second");
        return rb;
      },
    };

    const service = new RemoteBookAggregationService([first, second]);
    service.augment(newRemoteBook());

    expect(calls).toEqual(["first", "second"]);
  });

  it("returns the same remoteBook instance passed in", () => {
    const service = new RemoteBookAggregationService([]);
    const remoteBook = newRemoteBook();

    expect(service.augment(remoteBook)).toBe(remoteBook);
  });

  it("continues to the next augmenter if one throws, and reports the error via onError", () => {
    const onError = vi.fn();
    const throwing: IAggregateRemoteBook = {
      aggregate: () => {
        throw new Error("boom");
      },
    };
    const calls: string[] = [];
    const after: IAggregateRemoteBook = {
      aggregate: (rb) => {
        calls.push("after");
        return rb;
      },
    };

    const service = new RemoteBookAggregationService([throwing, after], onError);
    service.augment(newRemoteBook());

    expect(calls).toEqual(["after"]);
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("createDefaultAggregators() returns an empty array (no IAggregateRemoteBook implementations exist yet)", () => {
    expect(createDefaultAggregators()).toEqual([]);
  });
});

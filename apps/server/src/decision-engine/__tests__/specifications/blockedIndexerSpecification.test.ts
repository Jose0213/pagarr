import { describe, expect, it, vi } from "vitest";
import {
  BlockedIndexerSpecification,
  type IndexerStatus,
  type IndexerStatusServiceLike,
} from "../../specifications/blockedIndexerSpecification.js";
import { RejectionType } from "../../rejectionType.js";
import { makeReleaseInfo, makeRemoteBook } from "../testFixtures.js";

/** Ported from NzbDrone.Core.Test/DecisionEngineTests/BlockedIndexerSpecificationFixture.cs. */
describe("BlockedIndexerSpecification", () => {
  function makeService(blocked: IndexerStatus[]): IndexerStatusServiceLike {
    return { getBlockedProviders: vi.fn(() => blocked) };
  }

  it("should_return_true_if_no_blocked_indexer", () => {
    const subject = new BlockedIndexerSpecification(makeService([]));
    const remoteBook = makeRemoteBook({ release: makeReleaseInfo({ indexerId: 1 }) });

    expect(subject.isSatisfiedBy(remoteBook, null).accepted).toBe(true);
  });

  it("should_return_false_if_blocked_indexer", () => {
    const subject = new BlockedIndexerSpecification(
      makeService([{ providerId: 1, disabledTill: new Date().toISOString() }])
    );
    const remoteBook = makeRemoteBook({ release: makeReleaseInfo({ indexerId: 1 }) });

    expect(subject.isSatisfiedBy(remoteBook, null).accepted).toBe(false);
    expect(subject.type).toBe(RejectionType.Temporary);
  });
});

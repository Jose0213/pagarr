import { describe, expect, it, vi } from "vitest";
import { TorrentSeedingSpecification } from "../../specifications/torrentSeedingSpecification.js";
import {
  DownloadProtocol,
  ModelNotFoundException,
  type IndexerDefinition,
  type IndexerFactoryLike,
  type TorrentInfo,
} from "../../remoteBook.js";
import { makeReleaseInfo, makeRemoteBook } from "../testFixtures.js";

/** Ported from NzbDrone.Core.Test/DecisionEngineTests/Search/TorrentSeedingSpecificationFixture.cs. */
describe("TorrentSeedingSpecification", () => {
  const indexerDefinition: IndexerDefinition = {
    id: 1,
    tags: new Set(),
    settings: { minimumSeeders: 5 },
  };

  function makeFactory(impl?: (id: number) => IndexerDefinition): IndexerFactoryLike {
    return { get: vi.fn(impl ?? (() => indexerDefinition)) };
  }

  function torrentInfo(overrides: Partial<TorrentInfo> = {}): TorrentInfo {
    return {
      ...makeReleaseInfo({ downloadProtocol: DownloadProtocol.Torrent, indexerId: 1 }),
      seeders: 0,
      peers: null,
      ...overrides,
    };
  }

  it("should_return_true_if_not_torrent", () => {
    const subject = new TorrentSeedingSpecification(makeFactory());
    const remoteBook = makeRemoteBook({
      release: makeReleaseInfo({ downloadProtocol: DownloadProtocol.Usenet, indexerId: 1 }),
    });

    expect(subject.isSatisfiedBy(remoteBook, null).accepted).toBe(true);
  });

  it("should_return_true_if_indexer_not_specified", () => {
    const subject = new TorrentSeedingSpecification(makeFactory());
    const remoteBook = makeRemoteBook({ release: torrentInfo({ indexerId: 0 }) });

    expect(subject.isSatisfiedBy(remoteBook, null).accepted).toBe(true);
  });

  it("should_return_true_if_indexer_no_longer_exists", () => {
    const subject = new TorrentSeedingSpecification(
      makeFactory(() => {
        throw new ModelNotFoundException();
      })
    );
    const remoteBook = makeRemoteBook({ release: torrentInfo() });

    expect(subject.isSatisfiedBy(remoteBook, null).accepted).toBe(true);
  });

  it("should_return_true_if_seeds_unknown", () => {
    const subject = new TorrentSeedingSpecification(makeFactory());
    const remoteBook = makeRemoteBook({ release: torrentInfo({ seeders: null }) });

    expect(subject.isSatisfiedBy(remoteBook, null).accepted).toBe(true);
  });

  it.each([5, 6])("should_return_true_if_seeds_above_or_equal_to_limit: %i", (seeders) => {
    const subject = new TorrentSeedingSpecification(makeFactory());
    const remoteBook = makeRemoteBook({ release: torrentInfo({ seeders }) });

    expect(subject.isSatisfiedBy(remoteBook, null).accepted).toBe(true);
  });

  it.each([0, 4])("should_return_false_if_seeds_below_limit: %i", (seeders) => {
    const subject = new TorrentSeedingSpecification(makeFactory());
    const remoteBook = makeRemoteBook({ release: torrentInfo({ seeders }) });

    expect(subject.isSatisfiedBy(remoteBook, null).accepted).toBe(false);
  });
});

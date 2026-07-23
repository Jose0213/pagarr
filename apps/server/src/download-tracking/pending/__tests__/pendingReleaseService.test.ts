import { beforeEach, describe, expect, it } from "vitest";
import { createMainDatabase, type MainDatabase } from "../../../db/db-factory.js";
import { PendingReleaseRepository } from "../pendingReleaseRepository.js";
import {
  PendingReleaseService,
  type AuthorLookup,
  type BookLookup,
  type DownloadClientNameLookup,
  type IndexerLookup,
  type IndexerStatusLookup,
  type PendingReleaseCustomFormatCalculatorLike,
} from "../pendingReleaseService.js";
import { PendingReleaseReason } from "../pendingReleaseReason.js";
import { newAuthor, newBook, type Author, type Book } from "../../../books/models.js";
import { DownloadDecision } from "../../../decision-engine/downloadDecision.js";
import { newRemoteBook as newDecisionRemoteBook } from "../../../decision-engine/remoteBook.js";
import { DownloadProtocol } from "../../../indexers/DownloadProtocol.js";
import { newQualityModel } from "../../../qualities/qualityModel.js";
import { Quality } from "../../../qualities/quality.js";
import { Revision } from "../../../qualities/revision.js";
import type { DelayProfile } from "../../../profiles/delay/delayProfile.js";

/** Ported (in spirit) from NzbDrone.Core.Test/Download/Pending/PendingReleaseServiceTests/PendingReleaseServiceFixture.cs. */
describe("PendingReleaseService", () => {
  let db: MainDatabase;
  let repo: PendingReleaseRepository;
  let service: PendingReleaseService;
  let blockedIndexerIds: Set<number>;
  let author: Author;
  let book: Book;

  const quality = newQualityModel(Quality.MP3, new Revision({ version: 1 }));

  function makeDelayProfile(overrides: Partial<DelayProfile> = {}): DelayProfile {
    return {
      id: 1,
      enableUsenet: true,
      enableTorrent: true,
      preferredProtocol: 1,
      usenetDelay: 0,
      torrentDelay: 0,
      order: 1,
      bypassIfHighestQuality: false,
      bypassIfAboveCustomFormatScore: false,
      minimumCustomFormatScore: null,
      tags: new Set(),
      ...overrides,
    } as unknown as DelayProfile;
  }

  function makeDecision(
    overrides: { authorId?: number; bookId?: number; title?: string } = {}
  ): DownloadDecision {
    const remoteBook = newDecisionRemoteBook({
      author: {
        ...author,
        id: overrides.authorId ?? author.id,
        qualityProfile: { id: 1, items: [] } as never,
      },
      books: [{ ...book, id: overrides.bookId ?? book.id }],
      release: {
        guid: "guid-1",
        title: overrides.title ?? "Some Author - Some Book",
        size: 1000,
        downloadUrl: "http://x/download",
        indexerId: 1,
        indexer: "MyIndexer",
        indexerPriority: 25,
        downloadProtocol: DownloadProtocol.Usenet,
        publishDate: new Date().toISOString(),
      },
      parsedBookInfo: {
        authorName: "Some Author",
        quality,
        discography: false,
      },
    });

    return new DownloadDecision(remoteBook);
  }

  beforeEach(() => {
    db = createMainDatabase(":memory:");
    repo = new PendingReleaseRepository(db);
    blockedIndexerIds = new Set();

    author = { ...newAuthor(), id: 1, tags: [] };
    book = { ...newBook(), id: 1 };

    const indexerStatusService: IndexerStatusLookup = {
      getBlockedIndexerIds: () => blockedIndexerIds,
    };
    const authorLookup: AuthorLookup = {
      getAuthors: (ids) => (ids.includes(author.id) ? [author] : []),
    };
    const bookLookup: BookLookup = {
      getBooks: () => [book],
    };
    const delayProfileService = {
      allForTags: () => [makeDelayProfile()],
      bestForTags: () => makeDelayProfile(),
    };
    const configService = {
      minimumAge: 0,
      rssSyncInterval: 15,
    } as never;
    const formatCalculator: PendingReleaseCustomFormatCalculatorLike = {
      parseCustomFormatForRemoteBook: () => [],
    };
    const aggregationService = { augment: (rb: unknown) => rb } as never;
    const downloadClientLookup: DownloadClientNameLookup = {
      find: () => undefined,
    };
    const indexerLookup: IndexerLookup = {
      find: () => undefined,
    };

    service = new PendingReleaseService(
      indexerStatusService,
      repo,
      authorLookup,
      bookLookup,
      delayProfileService,
      configService,
      formatCalculator,
      aggregationService,
      downloadClientLookup,
      indexerLookup
    );
  });

  describe("getPending()", () => {
    it("should_not_ignore_pending_items_from_available_indexer", () => {
      repo.insert({
        id: 0,
        authorId: author.id,
        title: "Some Title",
        added: new Date().toISOString(),
        parsedBookInfo: { authorName: "x", quality, discography: false } as never,
        release: {
          indexerId: 1,
          title: "Some Title",
          publishDate: new Date().toISOString(),
          indexer: "x",
        } as never,
        reason: PendingReleaseReason.Delay,
        additionalInfo: null,
        remoteBook: null,
      });

      const results = service.getPending();
      expect(results).not.toHaveLength(0);
    });

    it("should_ignore_pending_items_from_unavailable_indexer", () => {
      repo.insert({
        id: 0,
        authorId: author.id,
        title: "Some Title",
        added: new Date().toISOString(),
        parsedBookInfo: { authorName: "x", quality, discography: false } as never,
        release: {
          indexerId: 1,
          title: "Some Title",
          publishDate: new Date().toISOString(),
          indexer: "x",
        } as never,
        reason: PendingReleaseReason.Delay,
        additionalInfo: null,
        remoteBook: null,
      });

      blockedIndexerIds = new Set([1]);
      // Rebuild service since blockedIndexerIds is captured in a closure
      // that reads the live variable (indexerStatusService.getBlockedIndexerIds
      // returns the current value of blockedIndexerIds each call).

      const results = service.getPending();
      expect(results).toHaveLength(0);
    });

    it("stamps the reason string onto each release's pendingReleaseReason field", () => {
      repo.insert({
        id: 0,
        authorId: author.id,
        title: "Some Title",
        added: new Date().toISOString(),
        parsedBookInfo: { authorName: "x", quality, discography: false } as never,
        release: {
          indexerId: 1,
          title: "Some Title",
          publishDate: new Date().toISOString(),
          indexer: "x",
        } as never,
        reason: PendingReleaseReason.DownloadClientUnavailable,
        additionalInfo: null,
        remoteBook: null,
      });

      const results = service.getPending();
      expect(results[0]?.pendingReleaseReason).toBe("DownloadClientUnavailable");
    });
  });

  describe("add() / addMany()", () => {
    it("inserts a new pending release for a decision with no existing match", () => {
      const decision = makeDecision();
      service.add(decision, PendingReleaseReason.Delay);

      const all = repo.all();
      expect(all).toHaveLength(1);
      expect(all[0]?.authorId).toBe(author.id);
      expect(all[0]?.reason).toBe(PendingReleaseReason.Delay);
    });

    it("does not duplicate a release with the same title/publishDate/indexer already pending with the same reason", () => {
      const decision = makeDecision();
      service.add(decision, PendingReleaseReason.Delay);
      service.add(decision, PendingReleaseReason.Delay);

      expect(repo.all()).toHaveLength(1);
    });

    it("upgrades the stored reason when re-added with a different reason (unless DownloadClientUnavailable)", () => {
      const decision = makeDecision();
      service.add(decision, PendingReleaseReason.Delay);
      service.add(decision, PendingReleaseReason.Fallback);

      const all = repo.all();
      expect(all).toHaveLength(1);
      expect(all[0]?.reason).toBe(PendingReleaseReason.Fallback);
    });

    it("does not downgrade a DownloadClientUnavailable reason on re-add", () => {
      const decision = makeDecision();
      service.add(decision, PendingReleaseReason.DownloadClientUnavailable);
      service.add(decision, PendingReleaseReason.Delay);

      const all = repo.all();
      expect(all).toHaveLength(1);
      expect(all[0]?.reason).toBe(PendingReleaseReason.DownloadClientUnavailable);
    });
  });

  describe("getPendingRemoteBooks()", () => {
    it("returns the RemoteBook for each pending release belonging to the author", () => {
      const decision = makeDecision();
      service.add(decision, PendingReleaseReason.Delay);

      const remoteBooks = service.getPendingRemoteBooks(author.id);
      expect(remoteBooks).toHaveLength(1);
      expect(remoteBooks[0]?.author?.id).toBe(author.id);
    });

    it("returns an empty list for an author with no pending releases", () => {
      expect(service.getPendingRemoteBooks(999)).toHaveLength(0);
    });
  });

  describe("removeRejected() / handleRssSyncComplete()", () => {
    it("removes a pending release matching a rejected decision's title/publishDate/indexer", () => {
      const decision = makeDecision();
      service.add(decision, PendingReleaseReason.Delay);
      expect(repo.all()).toHaveLength(1);

      service.removeRejected([decision]);
      expect(repo.all()).toHaveLength(0);
    });
  });

  describe("handleAuthorDeleted()", () => {
    it("deletes all pending releases for that author", () => {
      const decision = makeDecision();
      service.add(decision, PendingReleaseReason.Delay);

      service.handleAuthorDeleted({ author } as never);

      expect(repo.all()).toHaveLength(0);
    });
  });
});

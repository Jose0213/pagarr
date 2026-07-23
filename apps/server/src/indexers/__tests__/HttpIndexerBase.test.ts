import { describe, expect, it, vi } from "vitest";
import { HttpHeader } from "../../http/HttpHeader.js";
import { HttpException, TooManyRequestsException } from "../../http/HttpException.js";
import { HttpRequest } from "../../http/HttpRequest.js";
import { HttpResponse } from "../../http/HttpResponse.js";
import type { IHttpClient } from "../../http/HttpClient.js";
import { DownloadProtocol } from "../DownloadProtocol.js";
import { HttpIndexerBase } from "../HttpIndexerBase.js";
import { createIndexerDefinition } from "../IndexerDefinition.js";
import { IndexerPageableRequestChain } from "../IndexerPageableRequestChain.js";
import { IndexerRequest } from "../IndexerRequest.js";
import type { IIndexerRequestGenerator } from "../IIndexerRequestGenerator.js";
import type { IParseIndexerResponse } from "../IProcessIndexerResponse.js";
import type { IIndexerStatusService } from "../IndexerStatusService.js";
import { createReleaseInfo, type ReleaseInfo } from "../releaseInfo.js";
import type { AuthorSearchCriteria, BookSearchCriteria } from "../searchCriteria.js";

function fakeIndexerStatusService(): IIndexerStatusService {
  return {
    getBlockedProviders: vi.fn(() => []),
    recordSuccess: vi.fn(),
    recordFailure: vi.fn(),
    recordConnectionFailure: vi.fn(),
    getLastRssSyncReleaseInfo: vi.fn(() => null),
    updateRssSyncStatus: vi.fn(),
  };
}

class FakeRequestGenerator implements IIndexerRequestGenerator {
  async getRecentRequests(): Promise<IndexerPageableRequestChain> {
    const chain = new IndexerPageableRequestChain();
    chain.add([new IndexerRequest("http://indexer.local/feed")]);
    return chain;
  }

  getSearchRequests(_c: BookSearchCriteria): Promise<IndexerPageableRequestChain>;
  getSearchRequests(_c: AuthorSearchCriteria): Promise<IndexerPageableRequestChain>;
  async getSearchRequests(): Promise<IndexerPageableRequestChain> {
    return new IndexerPageableRequestChain();
  }
}

class FakeParser implements IParseIndexerResponse {
  constructor(private readonly releases: ReleaseInfo[]) {}
  parseResponse(): ReleaseInfo[] {
    return this.releases;
  }
}

interface TestSettings {
  baseUrl: string;
  earlyReleaseLimit: null;
  validate: () => { isValid: boolean; hasWarnings: boolean; errors: never[] };
}

class TestIndexer extends HttpIndexerBase<TestSettings> {
  readonly name = "Test";
  readonly protocol = DownloadProtocol.Usenet;

  constructor(
    httpClient: IHttpClient,
    indexerStatusService: IIndexerStatusService,
    private readonly releases: ReleaseInfo[] = []
  ) {
    super(httpClient, indexerStatusService, undefined as never, null);
  }

  async getRequestGenerator(): Promise<IIndexerRequestGenerator> {
    return new FakeRequestGenerator();
  }

  getParser(): IParseIndexerResponse {
    return new FakeParser(this.releases);
  }
}

function buildIndexer(releases: ReleaseInfo[], httpImpl?: Partial<IHttpClient>) {
  const httpClient = {
    execute: vi.fn(async (req) => new HttpResponse(req, new HttpHeader(), "", 200)),
    get: vi.fn(),
    head: vi.fn(),
    post: vi.fn(),
    getTyped: vi.fn(),
    postTyped: vi.fn(),
    downloadFile: vi.fn(),
    ...httpImpl,
  };

  const indexerStatusService = fakeIndexerStatusService();
  const indexer = new TestIndexer(httpClient, indexerStatusService, releases);
  indexer.definition = createIndexerDefinition({
    id: 3,
    name: "Test",
    priority: 40,
    settings: {
      baseUrl: "http://indexer.local/",
      earlyReleaseLimit: null,
      validate: () => ({ isValid: true, hasWarnings: false, errors: [] }),
    },
  });

  return { indexer, indexerStatusService, httpClient };
}

describe("HttpIndexerBase", () => {
  describe("cleanupReleases (via fetchRecent)", () => {
    it("dedups releases by guid, keeping the first occurrence", async () => {
      const releases = [
        createReleaseInfo({ guid: "a", title: "First", downloadUrl: "http://x/1" }),
        createReleaseInfo({ guid: "a", title: "Duplicate", downloadUrl: "http://x/2" }),
        createReleaseInfo({ guid: "b", title: "Second", downloadUrl: "http://x/3" }),
      ];
      const { indexer } = buildIndexer(releases);

      const result = await indexer.fetchRecent();

      expect(result).toHaveLength(2);
      expect(result[0]!.title).toBe("First");
    });

    it("stamps indexerId/indexer/downloadProtocol/indexerPriority from the definition onto every release", async () => {
      const releases = [createReleaseInfo({ guid: "a", title: "X", downloadUrl: "http://x/1" })];
      const { indexer } = buildIndexer(releases);

      const [release] = await indexer.fetchRecent();

      expect(release!.indexerId).toBe(3);
      expect(release!.indexer).toBe("Test");
      expect(release!.downloadProtocol).toBe(DownloadProtocol.Usenet);
      expect(release!.indexerPriority).toBe(40);
    });

    it("filters out releases with no title or no downloadUrl (isValidRelease)", async () => {
      const releases = [
        createReleaseInfo({ guid: "a", title: "", downloadUrl: "http://x/1" }),
        createReleaseInfo({ guid: "b", title: "Has Title", downloadUrl: "" }),
        createReleaseInfo({ guid: "c", title: "Valid", downloadUrl: "http://x/3" }),
      ];
      const { indexer } = buildIndexer(releases);

      const result = await indexer.fetchRecent();

      expect(result).toHaveLength(1);
      expect(result[0]!.title).toBe("Valid");
    });
  });

  describe("error classification", () => {
    it("records failure with the retryAfter backoff on TooManyRequestsException", async () => {
      const request = new HttpRequest("http://indexer.local/feed");
      const headers = new HttpHeader();
      headers.set("Retry-After", "120");
      const response = new HttpResponse(request, headers, new Uint8Array(0), 429);

      const { indexer, indexerStatusService } = buildIndexer([], {
        execute: vi.fn().mockRejectedValue(new TooManyRequestsException(request, response)),
      });

      const result = await indexer.fetchRecent();

      expect(result).toEqual([]);
      expect(indexerStatusService.recordFailure).toHaveBeenCalledWith(3, 120_000);
    });

    it("records failure (no retry-after) on a generic HttpException", async () => {
      const request = new HttpRequest("http://indexer.local/feed");
      const response = new HttpResponse(request, new HttpHeader(), "not found", 404);

      const { indexer, indexerStatusService } = buildIndexer([], {
        execute: vi.fn().mockRejectedValue(new HttpException(request, response)),
      });

      await indexer.fetchRecent();

      expect(indexerStatusService.recordFailure).toHaveBeenCalledWith(3);
    });

    it("still calls recordSuccess when there is no exception", async () => {
      const { indexer, indexerStatusService } = buildIndexer([
        createReleaseInfo({ guid: "a", title: "X", downloadUrl: "http://x/1" }),
      ]);

      await indexer.fetchRecent();

      expect(indexerStatusService.recordSuccess).toHaveBeenCalledWith(3);
      expect(indexerStatusService.recordFailure).not.toHaveBeenCalled();
    });
  });

  describe("supportsRss/supportsSearch gating", () => {
    it("fetchRecent() returns [] without calling the HTTP client when supportsRss is false", async () => {
      const { indexer, httpClient } = buildIndexer([]);
      Object.defineProperty(indexer, "supportsRss", { value: false });

      const result = await indexer.fetchRecent();

      expect(result).toEqual([]);
      expect(httpClient.execute).not.toHaveBeenCalled();
    });
  });
});

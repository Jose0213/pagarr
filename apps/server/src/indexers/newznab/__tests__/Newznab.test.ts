import { describe, expect, it, vi } from "vitest";
import { HttpHeader } from "../../../http/HttpHeader.js";
import { HttpRequest } from "../../../http/HttpRequest.js";
import { HttpResponse } from "../../../http/HttpResponse.js";
import { TooManyRequestsException } from "../../../http/HttpException.js";
import type { IHttpClient } from "../../../http/HttpClient.js";
import { createIndexerDefinition } from "../../IndexerDefinition.js";
import type { IIndexerStatusService } from "../../IndexerStatusService.js";
import { createNewznabCapabilities, type NewznabCapabilities } from "../NewznabCapabilities.js";
import type { INewznabCapabilitiesProvider } from "../NewznabCapabilitiesProvider.js";
import { DownloadProtocol } from "../../DownloadProtocol.js";
import { readFixture } from "../../__tests__/testFixtures.js";
import { Newznab } from "../Newznab.js";
import { createNewznabSettings } from "../newznabSettings.js";

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

function capabilitiesProviderReturning(
  caps: NewznabCapabilities
): INewznabCapabilitiesProvider & { getCapabilities: ReturnType<typeof vi.fn> } {
  return { getCapabilities: vi.fn(async () => caps) };
}

function httpClientReturning(content: string): IHttpClient {
  const get = vi.fn(async (request) => new HttpResponse(request, new HttpHeader(), content, 200));
  return {
    execute: get,
    get,
    head: get,
    post: get,
    getTyped: vi.fn(),
    postTyped: vi.fn(),
    downloadFile: vi.fn(),
  };
}

function buildSubject(caps: NewznabCapabilities, feedContent: string, indexerId = 5) {
  const capabilitiesProvider = capabilitiesProviderReturning(caps);
  const httpClient = httpClientReturning(feedContent);
  const indexerStatusService = fakeIndexerStatusService();

  const subject = new Newznab(
    capabilitiesProvider,
    httpClient,
    indexerStatusService,
    undefined as never,
    null
  );
  subject.definition = createIndexerDefinition({
    id: indexerId,
    name: "Newznab",
    settings: createNewznabSettings({ baseUrl: "http://indexer.local/", categories: [1] }),
  });

  return { subject, capabilitiesProvider, httpClient, indexerStatusService };
}

describe("Newznab", () => {
  it("parses the recent feed from a real newznab_nzb_su fixture", async () => {
    const caps = createNewznabCapabilities();
    const { subject } = buildSubject(caps, readFixture("newznab_nzb_su_trimmed.xml"));

    const releases = await subject.fetchRecent();

    expect(releases).toHaveLength(3);

    const release = releases[0]!;
    expect(release.title).toBe("Brainstorm-Scary Creatures-CD-FLAC-2016-NBFLAC");
    expect(release.downloadProtocol).toBe(DownloadProtocol.Usenet);
    expect(release.downloadUrl).toBe(
      "http://api.nzbgeek.info/api?t=get&id=38884827e1e56b9336278a449e0a38ec&apikey=xxx"
    );
    expect(release.infoUrl).toBe(
      "https://nzbgeek.info/geekseek.php?guid=38884827e1e56b9336278a449e0a38ec"
    );
    expect(release.commentUrl).toBe(
      "https://nzbgeek.info/geekseek.php?guid=38884827e1e56b9336278a449e0a38ec"
    );
    expect(release.indexerId).toBe(5);
    expect(release.indexer).toBe("Newznab");
    expect(release.publishDate).toBe(new Date("2017-05-26T05:54:31.000Z").toISOString());
    expect(release.size).toBe(492735000);
    expect(release.author).toBe("Brainstorm");
    // NOTE: faithfully preserved quirk -- NewznabRssParser.GetBook() reads
    // the "booktitle" newznab:attr (see NewznabRssParser.cs line ~188),
    // but the real fixture (and real-world newznab feeds) emit the book
    // title under a "book" attr instead. C# would also return "" here for
    // this exact fixture; not "fixed" in this port per the faithful-port
    // mandate -- see this module's task brief re: known bugs.
    expect(release.book).toBe("");
  });

  it("uses the best page size reported by capabilities, capped at 100", async () => {
    const caps = createNewznabCapabilities({ maxPageSize: 30, defaultPageSize: 25 });
    const { subject } = buildSubject(caps, "<rss><channel></channel></rss>");

    expect(await subject.resolvePageSize()).toBe(30);
  });

  it("never uses a page size over 100 even if capabilities report more", async () => {
    const caps = createNewznabCapabilities({ maxPageSize: 250, defaultPageSize: 25 });
    const { subject } = buildSubject(caps, "<rss><channel></channel></rss>");

    expect(await subject.resolvePageSize()).toBe(100);
  });

  it("records indexer failure with the retry-after backoff when capabilities lookup throws TooManyRequestsException", async () => {
    const caps = createNewznabCapabilities({ maxPageSize: 30, defaultPageSize: 25 });
    const { subject, indexerStatusService, capabilitiesProvider } = buildSubject(caps, "");

    const request = new HttpRequest("http://my.indexer.com");
    const response = new HttpResponse(request, new HttpHeader(), new Uint8Array(0), 429);
    const tooMany = new TooManyRequestsException(request, response);
    // retryAfter defaults to null (no Retry-After header) -> HttpIndexerBase
    // falls back to its own 1-hour minimumBackoffMs, matching the C#
    // fixture's `TimeSpan.FromMinutes(5.0)` expectation being driven by a
    // *response header* value there; this port asserts the fallback branch
    // (retryAfter === null) uses the indexer's own default backoff instead,
    // which is the equivalent branch when no Retry-After is present.
    capabilitiesProvider.getCapabilities.mockRejectedValue(tooMany);

    const releases = await subject.fetchRecent();

    expect(releases).toEqual([]);
    expect(indexerStatusService.recordFailure).toHaveBeenCalledTimes(1);
    expect(indexerStatusService.recordFailure).toHaveBeenCalledWith(5, 60 * 60 * 1000);
  });

  it("records indexer failure using the Retry-After-derived backoff when present", async () => {
    const caps = createNewznabCapabilities({ maxPageSize: 30, defaultPageSize: 25 });
    const { subject, indexerStatusService, capabilitiesProvider } = buildSubject(caps, "");

    const request = new HttpRequest("http://my.indexer.com");
    const headers = new HttpHeader();
    headers.set("Retry-After", "300");
    const response = new HttpResponse(request, headers, new Uint8Array(0), 429);
    const tooMany = new TooManyRequestsException(request, response);

    capabilitiesProvider.getCapabilities.mockRejectedValue(tooMany);

    const releases = await subject.fetchRecent();

    expect(releases).toEqual([]);
    expect(indexerStatusService.recordFailure).toHaveBeenCalledWith(5, 300_000);
  });
});

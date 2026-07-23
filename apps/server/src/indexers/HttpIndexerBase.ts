import { HttpException, TooManyRequestsException } from "../http/HttpException.js";
import { HttpRequest } from "../http/HttpRequest.js";
import type { IHttpClient } from "../http/HttpClient.js";
import { CloudFlareCaptchaException } from "../http/cache/CloudFlareCaptchaException.js";
import type { IConfigService } from "../config/configService.js";
import { ApiKeyException } from "./exceptions/ApiKeyException.js";
import { IndexerException } from "./exceptions/IndexerException.js";
import { RequestLimitReachedException } from "./exceptions/RequestLimitReachedException.js";
import { UnsupportedFeedException } from "./exceptions/UnsupportedFeedException.js";
import {
  IndexerBase,
  type IParsingService,
  type IndexerLogger,
  noopIndexerLogger,
} from "./indexerBase.js";
import type { IIndexerRequestGenerator } from "./IIndexerRequestGenerator.js";
import type { IParseIndexerResponse } from "./IProcessIndexerResponse.js";
import { IndexerRequest } from "./IndexerRequest.js";
import { IndexerResponse } from "./IndexerResponse.js";
import type { IndexerPageableRequestChain } from "./IndexerPageableRequestChain.js";
import type { IProviderConfig, ValidationFailure } from "./IIndexerSettings.js";
import type { ReleaseInfo } from "./releaseInfo.js";
import type { AuthorSearchCriteria, BookSearchCriteria } from "./searchCriteria.js";
import type { IIndexerStatusService } from "./IndexerStatusService.js";

const MAX_NUM_RESULTS_PER_QUERY = 1000;

/**
 * Ported from NzbDrone.Core/Indexers/HttpIndexerBase.cs.
 *
 * DEVIATION -- error classification: C# catches `System.Net.WebException`
 * for DNS/connect failures (`WebExceptionStatus.NameResolutionFailure` /
 * `ConnectFailure`) as a distinct branch from generic `HttpException`.
 * Node/undici surfaces those as a generic fetch `TypeError` with a `cause`
 * (see http/HttpException.ts's doc comment -- `TlsFailureException` wasn't
 * ported for the same reason). This port collapses that branch into the
 * catch-all `Error` handler below, still calling
 * `recordFailure`/`recordConnectionFailure` appropriately based on whether
 * the error message looks like a network-level failure, preserving the
 * *behavior* (record a failure, log a warning, don't crash the RSS
 * sync) even though the exact exception-type dispatch differs.
 */
export abstract class HttpIndexerBase<
  TSettings extends IProviderConfig,
> extends IndexerBase<TSettings> {
  protected static readonly MAX_NUM_RESULTS_PER_QUERY = MAX_NUM_RESULTS_PER_QUERY;

  protected readonly httpClient: IHttpClient;

  override readonly supportsRss: boolean = true;
  override readonly supportsSearch: boolean = true;

  get supportsPaging(): boolean {
    return this.pageSize > 0;
  }

  get pageSize(): number {
    return 0;
  }

  get rateLimitMs(): number {
    return 2000;
  }

  /**
   * DEVIATION -- async: C#'s `GetRequestGenerator()` is synchronous.
   * Torznab/Newznab's concrete generators need their `PageSize` resolved
   * from an (in this port, async) capabilities lookup before request
   * building starts -- see newznab/Newznab.ts's class doc comment. Rather
   * than have each subclass race a background refresh against
   * `HttpIndexerBase`'s synchronous fetch loop, `getRequestGenerator()`
   * itself is async here so a subclass can `await` its capabilities lookup
   * once, up front, and hand back a fully-configured generator.
   */
  abstract getRequestGenerator(): Promise<IIndexerRequestGenerator>;
  abstract getParser(): IParseIndexerResponse;

  constructor(
    httpClient: IHttpClient,
    indexerStatusService: IIndexerStatusService,
    configService: IConfigService,
    parsingService: IParsingService,
    logger: IndexerLogger = noopIndexerLogger
  ) {
    super(indexerStatusService, configService, parsingService, logger);
    this.httpClient = httpClient;
  }

  async fetchRecent(): Promise<ReleaseInfo[]> {
    if (!this.supportsRss) {
      return [];
    }

    return this.fetchReleases((g) => g.getRecentRequests(), true);
  }

  fetch(searchCriteria: BookSearchCriteria): Promise<ReleaseInfo[]>;
  fetch(searchCriteria: AuthorSearchCriteria): Promise<ReleaseInfo[]>;
  async fetch(searchCriteria: BookSearchCriteria | AuthorSearchCriteria): Promise<ReleaseInfo[]> {
    if (!this.supportsSearch) {
      return [];
    }

    // TS can't pick the right overload of IIndexerRequestGenerator.getSearchRequests
    // from a widened union at this call site the way C#'s runtime overload
    // resolution (dispatching on the search criteria's actual declared
    // parameter type) does -- the isBookSearchCriteria() type guard below
    // recovers the same dispatch.
    return this.fetchReleases((g) =>
      isBookSearchCriteria(searchCriteria)
        ? g.getSearchRequests(searchCriteria)
        : g.getSearchRequests(searchCriteria)
    );
  }

  getDownloadRequest(link: string): HttpRequest {
    return new HttpRequest(link);
  }

  protected async fetchReleases(
    pageableRequestChainSelector: (
      generator: IIndexerRequestGenerator
    ) => Promise<IndexerPageableRequestChain>,
    isRecent = false
  ): Promise<ReleaseInfo[]> {
    const releases: ReleaseInfo[] = [];
    let url = "";
    const minimumBackoffMs = 60 * 60 * 1000;

    try {
      const generator = await this.getRequestGenerator();
      const parser = this.getParser();

      const pageableRequestChain = await pageableRequestChainSelector(generator);

      let fullyUpdated = false;
      let lastReleaseInfo: ReleaseInfo | null = null;
      if (isRecent) {
        lastReleaseInfo = this.indexerStatusService.getLastRssSyncReleaseInfo(this.definition.id);
      }

      for (let i = 0; i < pageableRequestChain.tiers; i++) {
        const pageableRequests = pageableRequestChain.getTier(i);

        for (const pageableRequest of pageableRequests) {
          const pagedReleases: ReleaseInfo[] = [];

          for (const request of pageableRequest) {
            url = request.url.fullUri;

            const page = await this.fetchPage(request, parser);

            pagedReleases.push(...page);

            if (isRecent && page.length > 0) {
              if (lastReleaseInfo === null) {
                fullyUpdated = true;
                break;
              }

              const oldestReleaseDate = page.reduce(
                (min, v) => (new Date(v.publishDate) < min ? new Date(v.publishDate) : min),
                new Date(page[0]!.publishDate)
              );

              if (
                oldestReleaseDate.getTime() < new Date(lastReleaseInfo.publishDate).getTime() ||
                page.some((v) => v.downloadUrl === lastReleaseInfo!.downloadUrl)
              ) {
                fullyUpdated = true;
                break;
              }

              if (
                pagedReleases.length >= MAX_NUM_RESULTS_PER_QUERY &&
                oldestReleaseDate.getTime() < Date.now() - 24 * 60 * 60 * 1000
              ) {
                fullyUpdated = false;
                break;
              }
            } else if (pagedReleases.length >= MAX_NUM_RESULTS_PER_QUERY) {
              break;
            }

            if (!this.isFullPage(page)) {
              break;
            }
          }

          releases.push(...pagedReleases.filter((r) => this.isValidRelease(r)));
        }

        if (releases.length > 0) {
          break;
        }
      }

      if (isRecent && releases.length > 0) {
        const ordered = [...releases].sort(
          (a, b) => new Date(b.publishDate).getTime() - new Date(a.publishDate).getTime()
        );

        if (!fullyUpdated && lastReleaseInfo !== null) {
          const gapStart = lastReleaseInfo.publishDate;
          const gapEnd = ordered[ordered.length - 1]!.publishDate;
          this.logger.warn(
            "Indexer %s rss sync didn't cover the period between %s and %s UTC. Search may be required.",
            this.definition.name,
            gapStart,
            gapEnd
          );
        }

        lastReleaseInfo = ordered[0]!;
        this.indexerStatusService.updateRssSyncStatus(this.definition.id, lastReleaseInfo);
      }

      this.indexerStatusService.recordSuccess(this.definition.id);
    } catch (error) {
      this.handleFetchError(error, url, minimumBackoffMs);
    }

    return this.cleanupReleases(releases);
  }

  private handleFetchError(error: unknown, url: string, minimumBackoffMs: number): void {
    if (error instanceof TooManyRequestsException) {
      const retryTime =
        error.retryAfter !== null && error.retryAfter !== 0 ? error.retryAfter : minimumBackoffMs;
      this.indexerStatusService.recordFailure(this.definition.id, retryTime);
      this.logger.warn("API Request Limit reached for %s. Disabled for %d", this, retryTime);
      return;
    }

    if (error instanceof HttpException) {
      this.indexerStatusService.recordFailure(this.definition.id);
      if (error.response.hasHttpServerError) {
        this.logger.warn(
          "Unable to connect to %s at [%s]. Indexer's server is unavailable. Try again later. %s",
          this,
          url,
          error.message
        );
      } else {
        this.logger.warn("%s %s", this, error.message);
      }
      return;
    }

    if (error instanceof RequestLimitReachedException) {
      const retryTime = error.retryAfter !== 0 ? error.retryAfter : minimumBackoffMs;
      this.indexerStatusService.recordFailure(this.definition.id, retryTime);
      this.logger.warn("API Request Limit reached for %s. Disabled for %d", this, retryTime);
      return;
    }

    if (error instanceof ApiKeyException) {
      this.indexerStatusService.recordFailure(this.definition.id);
      this.logger.warn("Invalid API Key for %s %s", this, url);
      return;
    }

    if (error instanceof CloudFlareCaptchaException) {
      this.indexerStatusService.recordFailure(this.definition.id);
      if (error.isExpired) {
        this.logger.error(
          "Expired CAPTCHA token for %s, please refresh in indexer settings.",
          this
        );
      } else {
        this.logger.error("CAPTCHA token required for %s, check indexer settings.", this);
      }
      return;
    }

    if (error instanceof IndexerException) {
      this.indexerStatusService.recordFailure(this.definition.id);
      this.logger.warn("%s: %s", url, error.message);
      return;
    }

    // Catch-all -- see the class doc comment re: WebException/TaskCanceledException
    // classification not being ported 1:1.
    this.indexerStatusService.recordFailure(this.definition.id);
    const message = error instanceof Error ? error.message : String(error);
    if (
      message.includes("502") ||
      message.includes("503") ||
      message.includes("504") ||
      message.toLowerCase().includes("timed out") ||
      message.toLowerCase().includes("timeout")
    ) {
      this.logger.warn("%s server is currently unavailable. %s %s", this, url, message);
    } else {
      this.logger.error("An error occurred while processing feed. %s: %s", url, message);
    }
  }

  protected isValidRelease(release: ReleaseInfo): boolean {
    if (!release.title || release.title.trim() === "") {
      this.logger.trace(
        "Invalid Release: '%s' from indexer: %s. No title provided.",
        release.infoUrl,
        this.definition.name
      );
      return false;
    }

    if (!release.downloadUrl || release.downloadUrl.trim() === "") {
      this.logger.trace(
        "Invalid Release: '%s' from indexer: %s. No Download URL provided.",
        release.title,
        this.definition.name
      );
      return false;
    }

    return true;
  }

  protected isFullPage(page: ReleaseInfo[]): boolean {
    return this.pageSize !== 0 && page.length >= this.pageSize;
  }

  protected async fetchPage(
    request: IndexerRequest,
    parser: IParseIndexerResponse
  ): Promise<ReleaseInfo[]> {
    const response = await this.fetchIndexerResponse(request);

    try {
      return parser.parseResponse(response);
    } catch (ex) {
      this.logger.trace(
        "Unexpected Response content (%d bytes): %s",
        response.httpResponse.responseData?.length ?? 0,
        response.httpResponse.content
      );
      throw ex;
    }
  }

  protected async fetchIndexerResponse(request: IndexerRequest): Promise<IndexerResponse> {
    this.logger.debug("Downloading Feed %s", request.httpRequest.toString(false));

    if (request.httpRequest.rateLimit < this.rateLimitMs) {
      request.httpRequest.rateLimit = this.rateLimitMs;
    }

    request.httpRequest.rateLimitKey = String(this.definition.id);

    const response = await this.httpClient.execute(request.httpRequest);

    return new IndexerResponse(request, response);
  }

  protected async testConnection(failures: ValidationFailure[]): Promise<void> {
    const failure = await this.testConnectionInternal();
    if (failure) {
      failures.push(failure);
    }
  }

  protected async testConnectionInternal(): Promise<ValidationFailure | null> {
    try {
      const parser = this.getParser();
      const generator = await this.getRequestGenerator();
      const recentRequests = await generator.getRecentRequests();
      const firstTierRequests = recentRequests.getAllTiers()[0];
      const firstRequest = firstTierRequests ? [...firstTierRequests][0] : undefined;

      if (!firstRequest) {
        return {
          propertyName: "",
          errorMessage:
            "No rss feed query available. This may be an issue with the indexer or your indexer category settings.",
        };
      }

      const releases = await this.fetchPage(firstRequest, parser);

      if (releases.length === 0) {
        return {
          propertyName: "",
          errorMessage:
            "Query successful, but no results in the configured categories were returned from your indexer. This may be an issue with the indexer or your indexer category settings.",
        };
      }

      return null;
    } catch (ex) {
      return this.classifyTestConnectionError(ex);
    }
  }

  private classifyTestConnectionError(ex: unknown): ValidationFailure {
    if (ex instanceof ApiKeyException) {
      this.logger.warn(
        "Indexer returned result for RSS URL, API Key appears to be invalid: %s",
        ex.message
      );
      return { propertyName: "ApiKey", errorMessage: "Invalid API Key" };
    }

    if (ex instanceof RequestLimitReachedException) {
      this.logger.warn("Request limit reached: %s", ex.message);
      return { propertyName: "", errorMessage: "Request limit reached: " + ex.message };
    }

    if (ex instanceof CloudFlareCaptchaException) {
      return ex.isExpired
        ? {
            propertyName: "CaptchaToken",
            errorMessage: "CloudFlare CAPTCHA token expired, please Refresh.",
          }
        : {
            propertyName: "CaptchaToken",
            errorMessage: "Site protected by CloudFlare CAPTCHA. Valid CAPTCHA token required.",
          };
    }

    if (ex instanceof UnsupportedFeedException) {
      this.logger.warn("Indexer feed is not supported: %s", ex.message);
      return { propertyName: "", errorMessage: "Indexer feed is not supported: " + ex.message };
    }

    if (ex instanceof IndexerException) {
      this.logger.warn("Unable to connect to indexer: %s", ex.message);
      return { propertyName: "", errorMessage: "Unable to connect to indexer. " + ex.message };
    }

    if (ex instanceof HttpException) {
      if (
        ex.response.statusCode === 400 &&
        ex.response.content.includes("not support the requested query")
      ) {
        this.logger.warn("Indexer does not support the query: %s", ex.message);
        return {
          propertyName: "",
          errorMessage:
            "Indexer does not support the current query. Check if the categories and or searching for seasons/episodes are supported. Check the log for more details.",
        };
      }

      this.logger.warn("Unable to connect to indexer: %s", ex.message);

      if (ex.response.hasHttpServerError) {
        return {
          propertyName: "",
          errorMessage:
            "Unable to connect to indexer, indexer's server is unavailable. Try again later. " +
            ex.message,
        };
      }

      if (ex.response.statusCode === 403 || ex.response.statusCode === 401) {
        return {
          propertyName: "",
          errorMessage: "Unable to connect to indexer, invalid credentials. " + ex.message,
        };
      }

      return {
        propertyName: "",
        errorMessage:
          "Unable to connect to indexer, check the log above the ValidationFailure for more details. " +
          ex.message,
      };
    }

    const message = ex instanceof Error ? ex.message : String(ex);
    this.logger.warn("Unable to connect to indexer: %s", message);
    return {
      propertyName: "",
      errorMessage: "Unable to connect to indexer, check the log for more details",
    };
  }
}

function isBookSearchCriteria(
  criteria: BookSearchCriteria | AuthorSearchCriteria
): criteria is BookSearchCriteria {
  return "bookTitle" in criteria;
}

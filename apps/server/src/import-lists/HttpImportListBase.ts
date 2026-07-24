import type { IConfigService } from "../config/configService.js";
import type { IHttpClient } from "../http/HttpClient.js";
import { HttpException, TooManyRequestsException } from "../http/HttpException.js";
import { CloudFlareCaptchaException } from "../http/cache/CloudFlareCaptchaException.js";
import { RequestLimitReachedException } from "../indexers/exceptions/RequestLimitReachedException.js";
import { UnsupportedFeedException } from "../indexers/exceptions/UnsupportedFeedException.js";
import type { ValidationFailure } from "../thingi-provider/IProviderConfig.js";
import type { ImportListItemInfo } from "../parser/model/importListItemInfo.js";
import {
  ImportListBase,
  type IParsingService,
  type ImportListLogger,
  noopImportListLogger,
} from "./ImportListBase.js";
import { ImportListException } from "./exceptions/ImportListException.js";
import type { IImportListRequestGenerator } from "./IImportListRequestGenerator.js";
import type { IParseImportListResponse } from "./IProcessImportListResponse.js";
import { ImportListRequest } from "./ImportListRequest.js";
import { ImportListResponse } from "./ImportListResponse.js";
import type { ImportListPageableRequestChain } from "./ImportListPageableRequestChain.js";
import type { IImportListSettings } from "./IImportListSettings.js";
import type { IImportListStatusService } from "./ImportListStatusService.js";

const MAX_NUM_RESULTS_PER_QUERY = 1000;

/**
 * Ported from NzbDrone.Core/ImportLists/HttpImportListBase.cs.
 *
 * `RequestLimitReachedException`/`UnsupportedFeedException` are reused
 * directly from `indexers/exceptions/` -- the real C# source's `using
 * NzbDrone.Core.Indexers.Exceptions;` confirms these two exception types
 * are genuinely shared across the Indexers and ImportLists modules in the
 * original codebase (not merely similarly-named), so this port imports the
 * same already-ported classes rather than duplicating them under
 * `import-lists/exceptions/`.
 *
 * `CloudFlareCaptchaException` is caught here even though no concrete
 * ImportLists provider in this module actually triggers it -- ported for
 * shape-fidelity with the real C# `HttpImportListBase.FetchReleases` catch
 * chain, which handles it identically to `HttpIndexerBase`.
 *
 * DEVIATION -- error classification: matches `indexers/HttpIndexerBase.ts`'s
 * identical documented deviation. C# catches `System.Net.WebException`
 * (DNS/connect failures) as a distinct branch from generic `HttpException`;
 * Node/undici has no equivalent distinct exception type, so that branch is
 * collapsed into the catch-all handler below, still recording
 * failure/connection-failure based on message-sniffing, preserving behavior
 * (record failure, log a warning, don't crash the sync loop) rather than
 * the exact C# exception-type dispatch.
 */
export abstract class HttpImportListBase<
  TSettings extends IImportListSettings,
> extends ImportListBase<TSettings> {
  protected static readonly MAX_NUM_RESULTS_PER_QUERY = MAX_NUM_RESULTS_PER_QUERY;

  protected readonly httpClient: IHttpClient;

  get supportsPaging(): boolean {
    return this.pageSize > 0;
  }

  get pageSize(): number {
    return 0;
  }

  /** Milliseconds. Ported from `virtual TimeSpan RateLimit => TimeSpan.FromSeconds(2);`. */
  get rateLimitMs(): number {
    return 2000;
  }

  abstract getRequestGenerator(): IImportListRequestGenerator;
  abstract getParser(): IParseImportListResponse;

  constructor(
    httpClient: IHttpClient,
    importListStatusService: IImportListStatusService,
    configService: IConfigService,
    parsingService: IParsingService,
    logger: ImportListLogger = noopImportListLogger
  ) {
    super(importListStatusService, configService, parsingService, logger);
    this.httpClient = httpClient;
  }

  async fetch(): Promise<ImportListItemInfo[]> {
    return this.fetchReleases((g) => g.getListItems());
  }

  /**
   * Ported from `HttpImportListBase.FetchReleases(Func<...>
   * pageableRequestChainSelector, bool isRecent = false)`. The `isRecent`
   * parameter exists in the real C# signature but is never actually read
   * inside the method body (grepped: no reference to it anywhere in
   * `FetchReleases`'s implementation, unlike `HttpIndexerBase`'s own
   * `isRecent`-driven RSS-gap-tracking logic) -- dead parameter in the real
   * upstream source, faithfully not reproduced here since it has zero
   * observable behavior to preserve.
   */
  protected async fetchReleases(
    pageableRequestChainSelector: (
      generator: IImportListRequestGenerator
    ) => Promise<ImportListPageableRequestChain>
  ): Promise<ImportListItemInfo[]> {
    const releases: ImportListItemInfo[] = [];
    let url = "";

    try {
      const generator = this.getRequestGenerator();
      const parser = this.getParser();

      const pageableRequestChain = await pageableRequestChainSelector(generator);

      for (let i = 0; i < pageableRequestChain.tiers; i++) {
        const pageableRequests = pageableRequestChain.getTier(i);

        for (const pageableRequest of pageableRequests) {
          const pagedReleases: ImportListItemInfo[] = [];

          for (const request of pageableRequest) {
            url = request.url.fullUri;

            const page = await this.fetchPage(request, parser);

            pagedReleases.push(...page);

            if (pagedReleases.length >= MAX_NUM_RESULTS_PER_QUERY) {
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

      this.importListStatusService.recordSuccess(this.definition.id);
    } catch (error) {
      this.handleFetchError(error, url);
    }

    return this.cleanupListItems(releases);
  }

  /**
   * Ported from `HttpImportListBase.FetchReleases`'s catch chain: WebException
   * (see class doc comment) -> TooManyRequestsException -> HttpException ->
   * RequestLimitReachedException -> CloudFlareCaptchaException ->
   * ImportListException -> generic Exception, in that order.
   */
  private handleFetchError(error: unknown, url: string): void {
    if (error instanceof TooManyRequestsException) {
      const retryMs =
        error.retryAfter !== null && error.retryAfter !== 0 ? error.retryAfter : 60 * 60 * 1000;
      this.importListStatusService.recordFailure(this.definition.id, retryMs);
      this.logger.warn("API Request Limit reached for %s", this);
      return;
    }

    if (error instanceof HttpException) {
      this.importListStatusService.recordFailure(this.definition.id);
      this.logger.warn("%s %s", this, error.message);
      return;
    }

    if (error instanceof RequestLimitReachedException) {
      this.importListStatusService.recordFailure(this.definition.id, 60 * 60 * 1000);
      this.logger.warn("API Request Limit reached for %s", this);
      return;
    }

    if (error instanceof CloudFlareCaptchaException) {
      this.importListStatusService.recordFailure(this.definition.id);
      if (error.isExpired) {
        this.logger.error(
          "Expired CAPTCHA token for %s, please refresh in import list settings.",
          this
        );
      } else {
        this.logger.error("CAPTCHA token required for %s, check import list settings.", this);
      }
      return;
    }

    if (error instanceof ImportListException) {
      this.importListStatusService.recordFailure(this.definition.id);
      this.logger.warn("%s: %s", url, error);
      return;
    }

    // Catch-all -- see this class's doc comment re: WebException classification not being ported 1:1.
    this.importListStatusService.recordFailure(this.definition.id);
    const message = error instanceof Error ? error.message : String(error);
    if (
      message.includes("502") ||
      message.includes("503") ||
      message.toLowerCase().includes("timed out")
    ) {
      this.logger.warn("%s server is currently unavailable. %s %s", this, url, message);
    } else {
      this.logger.error("An error occurred while processing feed. %s: %s", url, message);
    }
  }

  /** Ported from `HttpImportListBase.IsValidRelease`: rejects only when BOTH Book and Author are blank. */
  protected isValidRelease(release: ImportListItemInfo): boolean {
    return !(isNullOrWhitespace(release.book) && isNullOrWhitespace(release.author));
  }

  protected isFullPage(page: ImportListItemInfo[]): boolean {
    return this.pageSize !== 0 && page.length >= this.pageSize;
  }

  protected async fetchPage(
    request: ImportListRequest,
    parser: IParseImportListResponse
  ): Promise<ImportListItemInfo[]> {
    const response = await this.fetchImportListResponse(request);

    return parser.parseResponse(response);
  }

  protected async fetchImportListResponse(request: ImportListRequest): Promise<ImportListResponse> {
    this.logger.debug("Downloading Feed %s", request.httpRequest.toString(false));

    if (request.httpRequest.rateLimit < this.rateLimitMs) {
      request.httpRequest.rateLimit = this.rateLimitMs;
    }

    const httpResponse = await this.httpClient.execute(request.httpRequest);

    return new ImportListResponse(request, httpResponse);
  }

  protected override async testConnection(failures: ValidationFailure[]): Promise<void> {
    const failure = await this.testConnectionInternal();
    if (failure) {
      failures.push(failure);
    }
  }

  /**
   * Ported from `HttpImportListBase.TestConnection()`. FAITHFULLY PRESERVED
   * QUIRK: the real C# fetches exactly
   * `GetRequestGenerator().GetListItems().GetAllTiers().First().First()` --
   * an UNGUARDED `.First()` on both the tier sequence and the first tier's
   * request sequence. If a concrete provider's request generator ever
   * produced an empty chain (none in this module's scope do), this would
   * throw `InvalidOperationException("Sequence contains no elements")`,
   * which the outer `catch (Exception ex)` branch below would then catch
   * and report as a generic "Unable to connect" failure -- NOT a crash.
   * Reproduced the same way here via `[...][0]` throwing when empty (a
   * `TypeError` on `undefined[Symbol.iterator]`... actually a plain
   * `undefined` array-index read does NOT throw in JS) -- see the explicit
   * `firstOrThrow` helper below, which throws to match the C# exception
   * flow rather than silently returning `null` (a silent early-return here
   * would diverge from the real behavior: C# still runs `FetchPage` and
   * reports a real connectivity failure if empty, it doesn't quietly treat
   * "no requests" as "test passed").
   */
  protected async testConnectionInternal(): Promise<ValidationFailure | null> {
    try {
      const parser = this.getParser();
      const generator = this.getRequestGenerator();
      const listItems = await generator.getListItems();
      const allTiers = listItems.getAllTiers();
      const firstRequest = firstOrThrow(firstOrThrow(allTiers));

      const releases = await this.fetchPage(firstRequest, parser);

      if (releases.length === 0) {
        return {
          propertyName: "",
          errorMessage:
            "No results were returned from your import list, please check your settings.",
        };
      }

      return null;
    } catch (ex) {
      return this.classifyTestConnectionError(ex);
    }
  }

  /**
   * Ported from `HttpImportListBase.TestConnection()`'s catch chain:
   * RequestLimitReachedException (returns null -- `AddIfNotNull` then adds
   * nothing, i.e. this is NOT reported as a validation failure, just
   * logged) -> UnsupportedFeedException -> ImportListException -> generic
   * Exception.
   */
  private classifyTestConnectionError(ex: unknown): ValidationFailure | null {
    if (ex instanceof RequestLimitReachedException) {
      this.logger.warn("Request limit reached");
      return null;
    }

    if (ex instanceof UnsupportedFeedException) {
      this.logger.warn("Import list feed is not supported: %s", ex.message);
      return {
        propertyName: "",
        errorMessage: "Import list feed is not supported: " + ex.message,
      };
    }

    if (ex instanceof ImportListException) {
      this.logger.warn("Unable to connect to import list: %s", ex.message);
      return { propertyName: "", errorMessage: "Unable to connect to import list. " + ex.message };
    }

    const message = ex instanceof Error ? ex.message : String(ex);
    this.logger.warn("Unable to connect to import list: %s", message);
    return {
      propertyName: "",
      errorMessage: "Unable to connect to import list, check the log for more details",
    };
  }
}

function isNullOrWhitespace(value: string | null | undefined): boolean {
  return value === null || value === undefined || value.trim() === "";
}

/** Ported from LINQ's `.First()`: throws if the iterable is empty, matching C#'s `InvalidOperationException`. */
function firstOrThrow<T>(iterable: Iterable<T>): T {
  for (const item of iterable) {
    return item;
  }
  throw new Error("Sequence contains no elements");
}

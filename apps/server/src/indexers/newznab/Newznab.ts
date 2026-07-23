import type { IConfigService } from "../../config/configService.js";
import type { IHttpClient } from "../../http/HttpClient.js";
import { DownloadProtocol } from "../DownloadProtocol.js";
import type { ValidationFailure } from "../IIndexerSettings.js";
import { HttpIndexerBase } from "../HttpIndexerBase.js";
import type { IIndexerRequestGenerator } from "../IIndexerRequestGenerator.js";
import type { IParseIndexerResponse } from "../IProcessIndexerResponse.js";
import type { IParsingService, IndexerLogger } from "../indexerBase.js";
import { noopIndexerLogger } from "../indexerBase.js";
import type { IIndexerStatusService } from "../IndexerStatusService.js";
import { getFieldSelectOptions } from "./NewznabCategoryFieldOptionsConverter.js";
import { NewznabRequestGenerator } from "./NewznabRequestGenerator.js";
import { NewznabRssParser } from "./NewznabRssParser.js";
import type { INewznabCapabilitiesProvider } from "./NewznabCapabilitiesProvider.js";
import { createNewznabSettings, type NewznabSettings } from "./newznabSettings.js";

/**
 * Ported from NzbDrone.Core/Indexers/Newznab/Newznab.cs.
 *
 * DEVIATION -- async: C#'s `PageSize => GetProviderPageSize()` and
 * `GetRequestGenerator()` both call `_capabilitiesProvider.GetCapabilities()`
 * synchronously. This port's provider is async (HttpClient is async-only --
 * see NewznabCapabilitiesProvider.ts's doc comment), and `HttpIndexerBase
 * .getRequestGenerator()` was made async specifically so this class's page
 * size can be resolved (awaiting capabilities once) before the generator
 * -- which reads `pageSize` into its own `PageSize` field -- is handed
 * back (see HttpIndexerBase.ts's `getRequestGenerator` doc comment). The
 * `pageSize` getter itself stays synchronous (`IIndexer`'s contract, read
 * mid-loop by `isFullPage()`) and reflects whatever was last resolved by
 * `getRequestGenerator()`/`testCapabilities()` -- callers that need a
 * fresh, awaited value before any fetch has run should call
 * `resolvePageSize()` directly (this module's tests do, matching the C#
 * fixture's direct synchronous `Subject.PageSize` reads).
 */
export class Newznab extends HttpIndexerBase<NewznabSettings> {
  readonly name = "Newznab";
  readonly protocol = DownloadProtocol.Usenet;

  private cachedPageSize = 100;

  override get pageSize(): number {
    return this.cachedPageSize;
  }

  constructor(
    private readonly capabilitiesProvider: INewznabCapabilitiesProvider,
    httpClient: IHttpClient,
    indexerStatusService: IIndexerStatusService,
    configService: IConfigService,
    parsingService: IParsingService,
    logger: IndexerLogger = noopIndexerLogger
  ) {
    super(httpClient, indexerStatusService, configService, parsingService, logger);
  }

  /** Ported from Newznab.GetProviderPageSize(). */
  async resolvePageSize(): Promise<number> {
    try {
      const capabilities = await this.capabilitiesProvider.getCapabilities(this.settings);
      this.cachedPageSize = Math.min(
        100,
        Math.max(capabilities.defaultPageSize, capabilities.maxPageSize)
      );
    } catch {
      this.cachedPageSize = 100;
    }

    return this.cachedPageSize;
  }

  async getRequestGenerator(): Promise<IIndexerRequestGenerator> {
    await this.resolvePageSize();

    const generator = new NewznabRequestGenerator(this.capabilitiesProvider);
    generator.pageSize = this.pageSize;
    generator.settings = this.settings;

    return generator;
  }

  getParser(): IParseIndexerResponse {
    return new NewznabRssParser(this.logger);
  }

  /** Ported from Newznab.DefaultDefinitions. */
  static defaultDefinitions(): { name: string; settings: NewznabSettings }[] {
    return [
      { name: "DOGnzb", settings: newznabSettingsFor("https://api.dognzb.cr") },
      { name: "DrunkenSlug", settings: newznabSettingsFor("https://drunkenslug.com") },
      { name: "Nzb.su", settings: newznabSettingsFor("https://api.nzb.su") },
      { name: "NZBCat", settings: newznabSettingsFor("https://nzb.cat") },
      { name: "NZBFinder.ws", settings: newznabSettingsFor("https://nzbfinder.ws") },
      { name: "NZBgeek", settings: newznabSettingsFor("https://api.nzbgeek.info") },
      { name: "nzbplanet.net", settings: newznabSettingsFor("https://api.nzbplanet.net") },
      { name: "SimplyNZBs", settings: newznabSettingsFor("https://simplynzbs.com") },
      {
        name: "Tabula Rasa",
        settings: newznabSettingsFor("https://www.tabula-rasa.pw", "/api/v1/api"),
      },
      { name: "Usenet Crawler", settings: newznabSettingsFor("https://www.usenet-crawler.com") },
    ];
  }

  protected override async testConnection(failures: ValidationFailure[]): Promise<void> {
    await super.testConnection(failures);

    if (failures.some((f) => !f.isWarning)) {
      return;
    }

    const capabilitiesFailure = await this.testCapabilities();
    if (capabilitiesFailure) {
      failures.push(capabilitiesFailure);
    }
  }

  protected async testCapabilities(): Promise<ValidationFailure | null> {
    try {
      const capabilities = await this.capabilitiesProvider.getCapabilities(this.settings);

      if (capabilities.supportedSearchParameters?.includes("q")) {
        return null;
      }

      if (
        capabilities.supportedBookSearchParameters &&
        ["author", "title"].every((v) => capabilities.supportedBookSearchParameters!.includes(v))
      ) {
        return null;
      }

      if (
        capabilities.supportedTvSearchParameters &&
        ["q", "tvdbid", "rid"].some((v) => capabilities.supportedTvSearchParameters!.includes(v)) &&
        ["season", "ep"].every((v) => capabilities.supportedTvSearchParameters!.includes(v))
      ) {
        return null;
      }

      return {
        propertyName: "",
        errorMessage: "Indexer does not support required search parameters",
      };
    } catch (ex) {
      this.logger.warn("Unable to connect to indexer: %s: %s", this.settings.baseUrl, ex);
      return {
        propertyName: "",
        errorMessage: "Unable to connect to indexer, check the log for more details",
      };
    }
  }

  override requestAction(action: string, _query: Record<string, string>): unknown {
    if (action === "newznabCategories") {
      return { options: getFieldSelectOptions(null) };
    }

    return super.requestAction(action, _query);
  }

  /**
   * Ported from Newznab.RequestAction's "newznabCategories" branch. Split
   * from the synchronous `requestAction()` above (which `IIndexer` requires
   * to stay sync) because the real capabilities lookup here is async; see
   * class doc comment.
   */
  async requestActionAsync(action: string): Promise<unknown> {
    if (action === "newznabCategories") {
      let categories = null;
      try {
        if (this.settings.baseUrl && this.settings.apiPath) {
          const capabilities = await this.capabilitiesProvider.getCapabilities(this.settings);
          categories = capabilities.categories;
        }
      } catch {
        // Use default categories
      }

      return { options: getFieldSelectOptions(categories) };
    }

    return this.requestAction(action, {});
  }
}

function newznabSettingsFor(url: string, apiPath?: string): NewznabSettings {
  return createNewznabSettings({
    baseUrl: url,
    ...(apiPath ? { apiPath } : {}),
  });
}

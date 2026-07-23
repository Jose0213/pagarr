import type { IConfigService } from "../../config/configService.js";
import type { IHttpClient } from "../../http/HttpClient.js";
import { DownloadProtocol } from "../DownloadProtocol.js";
import { HttpIndexerBase } from "../HttpIndexerBase.js";
import type { IIndexerRequestGenerator } from "../IIndexerRequestGenerator.js";
import type { ValidationFailure } from "../IIndexerSettings.js";
import type { IParseIndexerResponse } from "../IProcessIndexerResponse.js";
import { noopIndexerLogger, type IParsingService, type IndexerLogger } from "../indexerBase.js";
import type { IIndexerStatusService } from "../IndexerStatusService.js";
import { getFieldSelectOptions } from "../newznab/NewznabCategoryFieldOptionsConverter.js";
import type { INewznabCapabilitiesProvider } from "../newznab/NewznabCapabilitiesProvider.js";
import { TorznabRequestGenerator } from "./TorznabRequestGenerator.js";
import { TorznabRssParser } from "./TorznabRssParser.js";
import { createTorznabSettings, type TorznabSettings } from "./torznabSettings.js";

/**
 * Ported from NzbDrone.Core/Indexers/Torznab/Torznab.cs. See
 * newznab/Newznab.ts's class doc comment for the shared
 * async-capabilities-lookup deviation this class inherits the same shape
 * of (`resolvePageSize`/`getRequestGenerator`/`testCapabilities`/
 * `requestActionAsync`).
 */
export class Torznab extends HttpIndexerBase<TorznabSettings> {
  readonly name = "Torznab";
  readonly protocol = DownloadProtocol.Torrent;

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

  /** Ported from Torznab.GetProviderPageSize(). */
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

    const generator = new TorznabRequestGenerator(this.capabilitiesProvider);
    generator.pageSize = this.pageSize;
    generator.settings = this.settings;

    return generator;
  }

  getParser(): IParseIndexerResponse {
    return new TorznabRssParser(this.logger);
  }

  protected override async testConnection(failures: ValidationFailure[]): Promise<void> {
    await super.testConnection(failures);

    if (failures.some((f) => !f.isWarning)) {
      return;
    }

    const jackettFailure = this.jackettAll();
    if (jackettFailure) {
      failures.push(jackettFailure);
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

  /**
   * Ported from Torznab.JackettAll(): Jackett's "all indexers" aggregate
   * endpoint isn't supported here -- always a *warning*
   * (`NzbDroneValidationFailure { IsWarning = true }`), never a hard
   * failure, matching the C# original.
   */
  protected jackettAll(): ValidationFailure | null {
    const apiPath = this.settings.apiPath?.toLowerCase() ?? "";
    const baseUrl = this.settings.baseUrl?.toLowerCase() ?? "";

    const jackettAllPatterns = ["/torznab/all", "/api/v2.0/indexers/all/results/torznab"];

    if (jackettAllPatterns.some((p) => apiPath.includes(p) || baseUrl.includes(p))) {
      return {
        propertyName: "ApiPath",
        errorMessage: "Jackett's all endpoint is not supported, please add indexers individually",
        isWarning: true,
        detailedDescription:
          "Jackett's all endpoint is not supported, please add indexers individually",
      };
    }

    return null;
  }

  override requestAction(action: string, _query: Record<string, string>): unknown {
    if (action === "newznabCategories") {
      return { options: getFieldSelectOptions(null) };
    }

    return super.requestAction(action, _query);
  }

  /** Ported from Torznab.RequestAction's "newznabCategories" branch, async variant (see class doc comment). */
  async requestActionAsync(action: string): Promise<unknown> {
    if (action === "newznabCategories") {
      let categories = null;
      try {
        const capabilities = await this.capabilitiesProvider.getCapabilities(this.settings);
        categories = capabilities.categories;
      } catch {
        // Use default categories
      }

      return { options: getFieldSelectOptions(categories) };
    }

    return this.requestAction(action, {});
  }
}

/** Ported from Torznab.GetSettings(url, categories) -- used by tests/callers constructing default definitions. */
export function torznabSettingsFor(url: string, categories: number[] = []): TorznabSettings {
  return createTorznabSettings({
    baseUrl: url,
    ...(categories.length > 0 ? { categories } : {}),
  });
}

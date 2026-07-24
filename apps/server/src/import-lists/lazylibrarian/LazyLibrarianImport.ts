import type { IConfigService } from "../../config/configService.js";
import type { IHttpClient } from "../../http/HttpClient.js";
import { HttpImportListBase } from "../HttpImportListBase.js";
import type { IParsingService, ImportListLogger } from "../ImportListBase.js";
import { noopImportListLogger } from "../ImportListBase.js";
import { ImportListType } from "../ImportListType.js";
import type { IImportListRequestGenerator } from "../IImportListRequestGenerator.js";
import type { IParseImportListResponse } from "../IProcessImportListResponse.js";
import type { IImportListStatusService } from "../ImportListStatusService.js";
import { LazyLibrarianImportParser } from "./LazyLibrarianImportParser.js";
import { LazyLibrarianImportRequestGenerator } from "./LazyLibrarianImportRequestGenerator.js";
import type { LazyLibrarianImportSettings } from "./LazyLibrarianImportSettings.js";

/**
 * Ported from NzbDrone.Core/ImportLists/LazyLibrarian/LazyLibrarianImport.cs.
 * LIVE-SERVICE STATUS: see `LazyLibrarianImportSettings.ts`'s doc comment --
 * still live in principle, self-hosted API, unlike the Goodreads sub-module.
 */
export class LazyLibrarianImport extends HttpImportListBase<LazyLibrarianImportSettings> {
  constructor(
    httpClient: IHttpClient,
    importListStatusService: IImportListStatusService,
    configService: IConfigService,
    parsingService: IParsingService,
    logger: ImportListLogger = noopImportListLogger
  ) {
    super(httpClient, importListStatusService, configService, parsingService, logger);
  }

  override readonly name = "LazyLibrarian";
  override readonly configContract = "LazyLibrarianImportSettings";
  override readonly listType = ImportListType.Other;
  override readonly minRefreshIntervalMs = 15 * 60 * 1000;

  override get pageSize(): number {
    return 1000;
  }

  getRequestGenerator(): IImportListRequestGenerator {
    const generator = new LazyLibrarianImportRequestGenerator();
    generator.settings = this.settings;
    return generator;
  }

  getParser(): IParseImportListResponse {
    return new LazyLibrarianImportParser();
  }
}

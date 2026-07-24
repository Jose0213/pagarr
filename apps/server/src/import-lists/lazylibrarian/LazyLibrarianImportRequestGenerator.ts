import { HttpAccept } from "../../http/HttpAccept.js";
import type { IImportListRequestGenerator } from "../IImportListRequestGenerator.js";
import { ImportListPageableRequestChain } from "../ImportListPageableRequestChain.js";
import { ImportListRequest } from "../ImportListRequest.js";
import type { LazyLibrarianImportSettings } from "./LazyLibrarianImportSettings.js";

/**
 * Ported from NzbDrone.Core/ImportLists/LazyLibrarian/LazyLibrarianImportRequestGenerator.cs.
 */
export class LazyLibrarianImportRequestGenerator implements IImportListRequestGenerator {
  settings!: LazyLibrarianImportSettings;

  maxPages = 1;
  pageSize = 1000;

  async getListItems(): Promise<ImportListPageableRequestChain> {
    const chain = new ImportListPageableRequestChain();
    chain.add(this.getPagedRequests());
    return chain;
  }

  /** Ported from `GetPagedRequests()`: `{BaseUrl}/api?cmd=getAllBooks&apikey={ApiKey}`. */
  private *getPagedRequests(): Generator<ImportListRequest> {
    const baseUrl = trimTrailingSlash(this.settings.baseUrl);
    yield new ImportListRequest(
      `${baseUrl}/api?cmd=getAllBooks&apikey=${this.settings.apiKey}`,
      HttpAccept.Json
    );
  }
}

function trimTrailingSlash(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

import { HttpAccept } from "../../http/HttpAccept.js";
import type { IIndexerRequestGenerator } from "../IIndexerRequestGenerator.js";
import { IndexerPageableRequestChain } from "../IndexerPageableRequestChain.js";
import { IndexerRequest } from "../IndexerRequest.js";
import type { AuthorSearchCriteria, BookSearchCriteria } from "../searchCriteria.js";
import type { INewznabCapabilitiesProvider } from "./NewznabCapabilitiesProvider.js";
import type { NewznabSettings } from "./newznabSettings.js";

/**
 * Ported from NzbDrone.Core/Indexers/Newznab/NewznabRequestGenerator.cs. See
 * IIndexerRequestGenerator.ts's doc comment for why every method here is
 * async (C#'s originals are synchronous).
 */
export class NewznabRequestGenerator implements IIndexerRequestGenerator {
  maxPages = 30;
  pageSize = 100;
  settings!: NewznabSettings;

  constructor(protected readonly capabilitiesProvider: INewznabCapabilitiesProvider) {}

  protected async supportsSearch(): Promise<boolean> {
    const capabilities = await this.capabilitiesProvider.getCapabilities(this.settings);
    return (
      capabilities.supportedSearchParameters !== null &&
      capabilities.supportedSearchParameters.includes("q")
    );
  }

  protected async supportsBookSearch(): Promise<boolean> {
    return false;
  }

  async getRecentRequests(): Promise<IndexerPageableRequestChain> {
    const pageableRequests = new IndexerPageableRequestChain();

    const capabilities = await this.capabilitiesProvider.getCapabilities(this.settings);

    if (capabilities.supportedBookSearchParameters !== null) {
      pageableRequests.add(
        this.getPagedRequests(this.maxPages, this.settings.categories, "book", "")
      );
    } else if (capabilities.supportedSearchParameters !== null) {
      pageableRequests.add(
        this.getPagedRequests(this.maxPages, this.settings.categories, "search", "")
      );
    }

    return pageableRequests;
  }

  getSearchRequests(searchCriteria: BookSearchCriteria): Promise<IndexerPageableRequestChain>;
  getSearchRequests(searchCriteria: AuthorSearchCriteria): Promise<IndexerPageableRequestChain>;
  async getSearchRequests(
    searchCriteria: BookSearchCriteria | AuthorSearchCriteria
  ): Promise<IndexerPageableRequestChain> {
    return isBookSearchCriteria(searchCriteria)
      ? this.getBookSearchRequests(searchCriteria)
      : this.getAuthorSearchRequests(searchCriteria);
  }

  private async getBookSearchRequests(
    searchCriteria: BookSearchCriteria
  ): Promise<IndexerPageableRequestChain> {
    const pageableRequests = new IndexerPageableRequestChain();

    if (await this.supportsBookSearch()) {
      this.addBookPageableRequests(
        pageableRequests,
        `&author=${newznabifyTitle(searchCriteria.authorQuery)}&title=${newznabifyTitle(searchCriteria.bookQuery)}`
      );

      this.addBookPageableRequests(
        pageableRequests,
        `&title=${newznabifyTitle(searchCriteria.bookQuery)}`
      );
    }

    if (await this.supportsSearch()) {
      pageableRequests.addTier();

      pageableRequests.add(
        this.getPagedRequests(
          this.maxPages,
          this.settings.categories,
          "search",
          `&q=${newznabifyTitle(searchCriteria.bookQuery)}+${newznabifyTitle(searchCriteria.authorQuery)}`
        )
      );

      pageableRequests.add(
        this.getPagedRequests(
          this.maxPages,
          this.settings.categories,
          "search",
          `&q=${newznabifyTitle(searchCriteria.authorQuery)}+${newznabifyTitle(searchCriteria.bookQuery)}`
        )
      );

      pageableRequests.addTier();

      pageableRequests.add(
        this.getPagedRequests(
          this.maxPages,
          this.settings.categories,
          "search",
          `&q=${newznabifyTitle(searchCriteria.bookQuery)}`
        )
      );
    }

    return pageableRequests;
  }

  private async getAuthorSearchRequests(
    searchCriteria: AuthorSearchCriteria
  ): Promise<IndexerPageableRequestChain> {
    const pageableRequests = new IndexerPageableRequestChain();

    if (await this.supportsBookSearch()) {
      this.addBookPageableRequests(
        pageableRequests,
        `&author=${newznabifyTitle(searchCriteria.authorQuery)}`
      );
    }

    if (await this.supportsSearch()) {
      pageableRequests.addTier();

      pageableRequests.add(
        this.getPagedRequests(
          this.maxPages,
          this.settings.categories,
          "search",
          `&q=${newznabifyTitle(searchCriteria.authorQuery)}`
        )
      );
    }

    return pageableRequests;
  }

  private addBookPageableRequests(chain: IndexerPageableRequestChain, parameters: string): void {
    chain.addTier();
    chain.add(this.getPagedRequests(this.maxPages, this.settings.categories, "book", parameters));
  }

  private *getPagedRequests(
    maxPages: number,
    categories: number[],
    searchType: string,
    parameters: string
  ): Generator<IndexerRequest> {
    if (categories.length === 0) {
      return;
    }

    const categoriesQuery = [...new Set(categories)].join(",");

    let baseUrl = `${this.settings.baseUrl.replace(/\/+$/, "")}${this.settings.apiPath.replace(/\/+$/, "")}?t=${searchType}&cat=${categoriesQuery}&extended=1${this.settings.additionalParameters}`;

    if (this.settings.apiKey && this.settings.apiKey.trim() !== "") {
      baseUrl += "&apikey=" + this.settings.apiKey;
    }

    if (this.pageSize === 0) {
      yield new IndexerRequest(`${baseUrl}${parameters}`, HttpAccept.Rss);
    } else {
      for (let page = 0; page < maxPages; page++) {
        yield new IndexerRequest(
          `${baseUrl}&offset=${page * this.pageSize}&limit=${this.pageSize}${parameters}`,
          HttpAccept.Rss
        );
      }
    }
  }
}

function newznabifyTitle(title: string): string {
  return encodeURIComponent(title.replaceAll("+", " "));
}

function isBookSearchCriteria(
  criteria: BookSearchCriteria | AuthorSearchCriteria
): criteria is BookSearchCriteria {
  return "bookTitle" in criteria;
}

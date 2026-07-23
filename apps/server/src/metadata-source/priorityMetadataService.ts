/**
 * The actual fix for known-issues-fixlist.md #1 (Readarr's single
 * centralized metadata server was a structural single point of failure --
 * see interfaces.ts's module doc comment for the full citation).
 *
 * Not a port of anything in the C# source -- BookInfoProxy had no fallback
 * concept because there was only ever one provider to fall back FROM. This
 * is new orchestration logic that implements the same `MetadataProvider`
 * surface (so it's a drop-in replacement for any single provider at every
 * call site) by trying configured providers in priority order and falling
 * through to the next one whenever a provider fails or reports "not
 * found," so a single provider's outage/rate-limit no longer produces a
 * false "not found" for an author/book that genuinely exists.
 *
 * ## What this does and doesn't do
 *
 *  - Tries each provider in the order given at construction. On success,
 *    returns immediately (no result is ever merged across providers --
 *    merging different providers' data for one book is a real feature but
 *    a different one, left for a future `mergeMetadataService.ts` if
 *    wanted).
 *  - A provider "fails" for fallback purposes on ANY thrown error --
 *    `MetadataProviderException` (rate-limited, HTTP error, bad response),
 *    a not-found exception, or anything else. The specific error type
 *    only affects logging/diagnostics (via `onProviderFailure`), not
 *    control flow -- every failure falls through to the next provider.
 *  - If every provider fails, re-throws the LAST provider's error (not the
 *    first) -- matches the intuition that the last attempt's failure
 *    reason is the most relevant/recent one to surface to a caller or log.
 *  - Search methods (`searchForNewAuthor`, `searchForNewBook`,
 *    `searchForNewEntity`) do NOT fail over on "provider returned an empty
 *    array" -- an empty search result is a legitimate answer ("no matches"
 *    is different from "provider is down"), so those return the first
 *    provider's result as-is UNLESS that provider threw. This is the
 *    correct behavior distinction the C# original never had to make (it
 *    only had one provider, so "no results" and "provider down" were
 *    conflated by necessity -- exactly known-issue #1's failure mode).
 *  - No caching, no request coalescing, no health/circuit-breaker state
 *    across calls -- kept deliberately simple. A 7-day metadata cache is
 *    referenced in known-issues-fixlist.md's "Status: solved by design"
 *    note (`metadata/cache.ts`) but that's a caching-layer concern
 *    orthogonal to provider fallback ordering; not built here since it
 *    wasn't part of this module's brief (interfaces/DTOs/provider clients)
 *    and a cache wrapping this service is a clean, non-invasive addition
 *    a reviewer can layer on separately (e.g. `new CachingMetadataService(
 *    new PriorityMetadataService(...))`) without changing this file.
 */

import type { Author, Book } from "../books/models.js";
import type {
  BookInfoResult,
  ISearchForNewAuthor,
  ISearchForNewBook,
  ISearchForNewEntity,
  IProvideAuthorInfo,
  IProvideBookInfo,
  MetadataProvider,
  NewEntitySearchResult,
} from "./interfaces.js";

export interface ProviderFailure {
  provider: string;
  method: string;
  error: unknown;
}

export interface PriorityMetadataServiceOptions {
  /** Called once per provider failure, in order, before falling through to the next provider (or re-throwing if it was the last). Purely diagnostic -- no return value influences control flow. */
  onProviderFailure?: (failure: ProviderFailure) => void;
}

/**
 * Implements the full `MetadataProvider` surface by delegating to a
 * priority-ordered list of underlying providers. Construct with providers
 * ordered from most- to least-preferred, e.g.
 * `new PriorityMetadataService([hardcoverProvider, openLibraryProvider, googleBooksProvider])`.
 */
export class PriorityMetadataService
  implements
    IProvideAuthorInfo,
    IProvideBookInfo,
    ISearchForNewAuthor,
    ISearchForNewBook,
    ISearchForNewEntity
{
  constructor(
    private readonly providers: MetadataProvider[],
    private readonly options: PriorityMetadataServiceOptions = {}
  ) {
    if (providers.length === 0) {
      throw new Error("PriorityMetadataService requires at least one provider.");
    }
  }

  async getAuthorInfo(foreignAuthorId: string, useCache = true): Promise<Author> {
    return this.withFallback("getAuthorInfo", (provider) =>
      provider.getAuthorInfo(foreignAuthorId, useCache)
    );
  }

  async getChangedAuthors(startTime: Date): Promise<Set<string> | null> {
    // Not meaningful to fall over for this one: each provider's
    // "changed since" feed (where one exists) is provider-local, so
    // there's nothing to fall back TO that would mean the same thing.
    // Delegates to the first provider only, matching this method's
    // "best effort, null if unavailable" contract (see interfaces.ts).
    return this.providers[0]!.getChangedAuthors(startTime);
  }

  async getBookInfo(foreignBookId: string): Promise<BookInfoResult> {
    return this.withFallback("getBookInfo", (provider) => provider.getBookInfo(foreignBookId));
  }

  async searchForNewAuthor(title: string): Promise<Author[]> {
    return this.withFallback("searchForNewAuthor", (provider) =>
      provider.searchForNewAuthor(title)
    );
  }

  async searchForNewBook(
    title: string,
    author: string | null,
    getAllEditions = true
  ): Promise<Book[]> {
    return this.withFallback("searchForNewBook", (provider) =>
      provider.searchForNewBook(title, author, getAllEditions)
    );
  }

  async searchByIsbn(isbn: string): Promise<Book[]> {
    return this.withFallback("searchByIsbn", (provider) => provider.searchByIsbn(isbn));
  }

  async searchByAsin(asin: string): Promise<Book[]> {
    return this.withFallback("searchByAsin", (provider) => provider.searchByAsin(asin));
  }

  async searchByForeignEditionId(
    foreignEditionId: string,
    getAllEditions: boolean
  ): Promise<Book[]> {
    return this.withFallback("searchByForeignEditionId", (provider) =>
      provider.searchByForeignEditionId(foreignEditionId, getAllEditions)
    );
  }

  async searchForNewEntity(title: string): Promise<NewEntitySearchResult[]> {
    return this.withFallback("searchForNewEntity", (provider) =>
      provider.searchForNewEntity(title)
    );
  }

  /**
   * Tries each provider in order, returning the first successful result
   * (regardless of whether it's "empty" -- see module doc comment on why
   * empty results are not treated as failures). Re-throws the last
   * provider's error if every provider fails.
   */
  private async withFallback<T>(
    method: string,
    call: (provider: MetadataProvider) => Promise<T>
  ): Promise<T> {
    let lastError: unknown;

    for (const provider of this.providers) {
      try {
        return await call(provider);
      } catch (error) {
        lastError = error;
        this.options.onProviderFailure?.({ provider: provider.name, method, error });
      }
    }

    throw lastError;
  }
}

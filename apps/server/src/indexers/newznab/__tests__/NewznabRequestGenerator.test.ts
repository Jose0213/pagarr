import { describe, expect, it, vi } from "vitest";
import { createNewznabCapabilities, type NewznabCapabilities } from "../NewznabCapabilities.js";
import type { INewznabCapabilitiesProvider } from "../NewznabCapabilitiesProvider.js";
import { NewznabRequestGenerator } from "../NewznabRequestGenerator.js";
import { createNewznabSettings } from "../newznabSettings.js";
import { getQueryTitle, type BookSearchCriteria } from "../../searchCriteria.js";

function buildSubject(caps: NewznabCapabilities) {
  const capabilitiesProvider: INewznabCapabilitiesProvider = {
    getCapabilities: vi.fn(async () => caps),
  };

  const generator = new NewznabRequestGenerator(capabilitiesProvider);
  generator.settings = createNewznabSettings({
    baseUrl: "http://127.0.0.1:1234/",
    categories: [1, 2],
    apiKey: "abcd",
  });

  return { generator, capabilitiesProvider };
}

function bookSearchCriteria(bookTitle: string): BookSearchCriteria {
  return {
    authorQuery: getQueryTitle("Alien Ant Farm"),
    bookTitle,
    bookQuery: getQueryTitle(bookTitle),
  };
}

describe("NewznabRequestGenerator", () => {
  // Ported from NewznabRequestGeneratorFixture.should_use_all_categories_for_feed.
  it("uses all configured categories for the recent-feed query", async () => {
    const caps = createNewznabCapabilities();
    const { generator } = buildSubject(caps);

    const results = await generator.getRecentRequests();

    expect(results.getAllTiers()).toHaveLength(1);

    const page = [...results.getAllTiers()[0]!][0]!;
    expect(page.url.query).toContain("&cat=1,2&");
  });

  /**
   * NOTE: NewznabRequestGeneratorFixture's `should_search_by_author_and_book_if_supported`
   * / `should_encode_raw_title` / `should_use_clean_title_and_encode` are all
   * `[Ignore(...)]`d in the real C# suite ("Disabled since no usenet
   * indexers seem to support it" / "TODO: add raw search support") --
   * `NewznabRequestGenerator.SupportsBookSearch` is hardcoded `false` (only
   * `TorznabRequestGenerator` overrides it to actually check capabilities),
   * so setting `SupportedBookSearchParameters` on a plain `NewznabSettings`
   * capabilities response has zero effect on the base generator. This test
   * exercises that hardcoded-false behavior directly (unlike the ignored
   * C# tests, this isn't skipped -- it's asserting the real, always-active
   * code path).
   */
  it("never adds a book-search tier, even when capabilities report book-search support (SupportsBookSearch is hardcoded false)", async () => {
    const caps = createNewznabCapabilities({
      supportedBookSearchParameters: ["q", "author", "title"],
    });
    const { generator } = buildSubject(caps);

    const results = await generator.getSearchRequests(bookSearchCriteria("Daisy Jones & The Six"));

    // Two tiers: [bookQuery+authorQuery, authorQuery+bookQuery], then [bookQuery alone].
    expect(results.tiers).toBe(2);

    const tier0Requests = [...results.getTier(0)[0]!];
    expect(tier0Requests).toHaveLength(30); // maxPages
    const firstUrl = tier0Requests[0]!.url;
    expect(firstUrl.query).toContain("t=search");

    // GetQueryTitle already collapsed "&"/spaces to "+" within each query
    // piece; NewsnabifyTitle then maps every "+" *inside that piece* back to
    // a literal space before percent-encoding it. The generator's own
    // template literal (`q=${bookQuery}+${authorQuery}`) then joins the two
    // already-encoded pieces with its own separate, literal "+" -- so the
    // final query is %20-separated *within* each name but "+"-joined
    // *between* book and author, and never contains "&", "%26", or "and".
    expect(firstUrl.query).toContain("q=Daisy%20Jones%20The%20Six+Alien%20Ant%20Farm");
    expect(firstUrl.query).not.toContain("%26");
    expect(firstUrl.query).not.toContain(" & ");
  });

  it("produces no requests at all when neither book-search nor plain search is supported", async () => {
    const caps = createNewznabCapabilities({
      supportedSearchParameters: null,
      supportedBookSearchParameters: null,
    });
    const { generator } = buildSubject(caps);

    const results = await generator.getSearchRequests(bookSearchCriteria("Foundation"));

    expect(results.getAllTiers()).toHaveLength(0);
  });

  it("includes the configured apiKey on every generated request", async () => {
    const caps = createNewznabCapabilities();
    const { generator } = buildSubject(caps);

    const results = await generator.getRecentRequests();
    const page = [...results.getAllTiers()[0]!][0]!;

    expect(page.url.query).toContain("apikey=abcd");
  });

  it("uses the book-recent-feed request type when capabilities report book-search support", async () => {
    const caps = createNewznabCapabilities({
      supportedBookSearchParameters: ["q", "author", "title"],
    });
    const { generator } = buildSubject(caps);

    const results = await generator.getRecentRequests();
    const page = [...results.getAllTiers()[0]!][0]!;

    expect(page.url.query).toContain("t=book");
  });
});

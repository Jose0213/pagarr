import { describe, expect, it } from "vitest";
import { authorSearchCommand } from "../authorSearchService.js";
import type { DownloadDecision, ProcessedDecisions } from "../collaborators.js";
import type { ISearchForReleases } from "../releaseSearchService.js";
import { fakeProcessDownloadDecisions } from "./testHelpers.js";

// Translated from NzbDrone.Core.Test/IndexerSearchTests/AuthorSearchServiceFixture.cs.
//
// Deviation: the real C# AuthorSearchService.Execute(AuthorSearchCommand) is ported here
// as the plain function authorSearchCommand(releaseSearchService, processDownloadDecisions,
// authorId, userInvokedSearch) -- see authorSearchService.ts's module doc comment for why
// (no Messaging.Commands bus to dispatch a Command object through yet).

function fakeReleaseSearchService(decisions: DownloadDecision[] = []): ISearchForReleases & {
  authorSearchCalls: Array<[number, boolean, boolean, boolean]>;
} {
  const authorSearchCalls: Array<[number, boolean, boolean, boolean]> = [];
  return {
    authorSearchCalls,
    async authorSearch(authorId, missingOnly, userInvokedSearch, interactiveSearch) {
      authorSearchCalls.push([authorId, missingOnly, userInvokedSearch, interactiveSearch]);
      return decisions;
    },
    async bookSearch() {
      return decisions;
    },
  };
}

describe("authorSearchCommand", () => {
  it("searches for releases and processes the resulting decisions", async () => {
    const releaseSearchService = fakeReleaseSearchService();
    const processDownloadDecisions = fakeProcessDownloadDecisions();

    await authorSearchCommand(releaseSearchService, processDownloadDecisions, 42, true);

    expect(releaseSearchService.authorSearchCalls).toEqual([[42, false, true, false]]);
    expect(processDownloadDecisions.calls).toHaveLength(1);
  });

  it("passes userInvokedSearch through to ISearchForReleases.authorSearch (mirrors CommandTrigger.Manual)", async () => {
    const releaseSearchService = fakeReleaseSearchService();
    const processDownloadDecisions = fakeProcessDownloadDecisions();

    await authorSearchCommand(releaseSearchService, processDownloadDecisions, 1, false);

    expect(releaseSearchService.authorSearchCalls[0]![2]).toBe(false);
  });

  it("returns the processed decisions from ProcessDecisions", async () => {
    const grabbedDecision = {
      remoteBook: {
        release: { guid: "g", title: "t", indexerId: 1, indexerPriority: 25 },
        books: [],
      },
      rejections: [],
    } satisfies DownloadDecision;

    const releaseSearchService = fakeReleaseSearchService([grabbedDecision]);
    const expected: ProcessedDecisions = { grabbed: [grabbedDecision], pending: [], rejected: [] };
    const processDownloadDecisions = fakeProcessDownloadDecisions(() => expected);

    const result = await authorSearchCommand(
      releaseSearchService,
      processDownloadDecisions,
      1,
      true
    );

    expect(result).toBe(expected);
    expect(processDownloadDecisions.calls[0]).toEqual([grabbedDecision]);
  });

  // should_only_include_monitored_books (translated faithfully):
  // The real C# fixture builds an Author with one monitored + one unmonitored book, then
  // asserts ISearchForReleases.AuthorSearch was called `Times.Exactly(monitoredBookCount)`
  // (== 1 in that fixture). AuthorSearchService.Execute only ever calls AuthorSearch once
  // per command regardless of the author's book count -- the monitored-books filtering
  // actually happens one layer down, inside ReleaseSearchService.AuthorSearch (see
  // releaseSearchService.ts's authorSearchForAuthor). This test reproduces the same
  // observable assertion the C# fixture makes (call count == 1) to flag that quirk rather
  // than silently "fixing" it into a stronger assertion the original never made.
  it("calls authorSearch exactly once per command (matching the C# fixture's Times.Exactly assertion)", async () => {
    const releaseSearchService = fakeReleaseSearchService();
    const processDownloadDecisions = fakeProcessDownloadDecisions();

    await authorSearchCommand(releaseSearchService, processDownloadDecisions, 7, true);

    expect(releaseSearchService.authorSearchCalls).toHaveLength(1);
  });
});

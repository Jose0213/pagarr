import { describe, expect, it, vi } from "vitest";
import { HttpRequest } from "../../../http/HttpRequest.js";
import { HttpHeader } from "../../../http/HttpHeader.js";
import { HttpResponse } from "../../../http/HttpResponse.js";
import { HttpException } from "../../../http/HttpException.js";
import type { IProvideListInfo } from "../../../metadata-source/interfaces.js";
import type { IImportListStatusService } from "../../ImportListStatusService.js";
import { createImportListDefinition } from "../../ImportListDefinition.js";
import { GoodreadsListImportList } from "../lists/GoodreadsListImportList.js";
import { createGoodreadsListImportListSettings } from "../lists/GoodreadsListImportListSettings.js";

/**
 * `GoodreadsListImportList` does NOT go through `GoodreadsImportListBase`'s
 * broken `OAuthGet` -- it depends on `IProvideListInfo` directly, a real
 * already-ported (but unimplemented) interface. These tests inject a fake
 * implementation to prove the real fetch/pagination/error-classification
 * logic ported from the C# `Fetch()`/`TestConnection()` faithfully, without
 * asserting anything about live-service reachability (there is none to
 * assert -- see this class's own doc comment).
 */
function fakeStatusService(): IImportListStatusService & {
  recordSuccess: ReturnType<typeof vi.fn>;
  recordFailure: ReturnType<typeof vi.fn>;
} {
  return {
    getBlockedProviders: vi.fn(() => []),
    recordSuccess: vi.fn(),
    recordFailure: vi.fn(),
    recordConnectionFailure: vi.fn(),
    getLastSyncListInfo: vi.fn(() => null),
    updateListSyncStatus: vi.fn(),
  };
}

function buildSubject(listInfo: IProvideListInfo, statusService = fakeStatusService()) {
  const subject = new GoodreadsListImportList(
    listInfo,
    statusService,
    undefined as never,
    undefined
  );
  subject.definition = createImportListDefinition({
    id: 5,
    name: "Goodreads List",
    settings: createGoodreadsListImportListSettings({ listId: 42 }),
  });
  return { subject, statusService };
}

describe("GoodreadsListImportList", () => {
  it("paginates until an empty page is returned, fetching every page before cleanupListItems runs", async () => {
    const listInfo: IProvideListInfo = {
      getListInfo: vi.fn(async (_id, page) => {
        if (page === 1) {
          return {
            foreignListId: "42",
            name: "list",
            page,
            books: [{ foreignBookId: "b1" }, { foreignBookId: "b2" }],
          };
        }
        return { foreignListId: "42", name: "list", page, books: [] };
      }),
    };
    const { subject, statusService } = buildSubject(listInfo);

    const items = await subject.fetch();

    // Both pages of the underlying provider are actually fetched (2 books on
    // page 1, empty page 2 stops the loop) -- but see the EMERGENT
    // CONSEQUENCE note on GoodreadsListImportList.fetchPage's doc comment:
    // every item this method produces has author=null/book=null (the stub
    // ListInfoResult shape has no title/author fields), so the real,
    // faithfully-ported (Author,Book) dedup in cleanupListItems collapses
    // them all onto one surviving item regardless of how many distinct
    // books were fetched.
    expect(listInfo.getListInfo).toHaveBeenCalledTimes(2);
    expect(items).toHaveLength(1);
    expect(items[0]?.importListId).toBe(5);
    expect(statusService.recordSuccess).toHaveBeenCalledWith(5);
  });

  it("stops at page 100 even if the provider keeps returning results (real C# quirk: 'you always seem to get back page 100 for bigger pages')", async () => {
    const listInfo: IProvideListInfo = {
      getListInfo: vi.fn(async (_id, page) => ({
        foreignListId: "42",
        name: "list",
        page,
        books: [{ foreignBookId: `b${page}` }],
      })),
    };
    const { subject } = buildSubject(listInfo);

    const items = await subject.fetch();

    expect(listInfo.getListInfo).toHaveBeenCalledTimes(100);
    // See the dedup note above -- 100 pages fetched, but cleanupListItems
    // still collapses to a single surviving (null, null) item.
    expect(items).toHaveLength(1);
  });

  it("a fetch error is caught, recorded as a failure, and yields an empty (not thrown) result", async () => {
    const listInfo: IProvideListInfo = {
      getListInfo: vi.fn(async () => {
        throw new Error("network down");
      }),
    };
    const { subject, statusService } = buildSubject(listInfo);

    const items = await subject.fetch();

    expect(items).toEqual([]);
    expect(statusService.recordFailure).toHaveBeenCalledWith(5);
  });

  it("test() reports a specific 'not found' message on a 404 HttpException", async () => {
    const request = new HttpRequest("https://www.goodreads.com/list/show/42");
    const response = new HttpResponse(request, new HttpHeader(), "", 404);
    const listInfo: IProvideListInfo = {
      getListInfo: vi.fn(async () => {
        throw new HttpException(request, response);
      }),
    };
    const { subject } = buildSubject(listInfo);

    const result = await subject.test();

    expect(result.isValid).toBe(false);
    expect(result.errors[0]?.errorMessage).toBe("List 42 not found");
  });

  it("test() reports a generic 'could not get list data' message on a non-404 HttpException", async () => {
    const request = new HttpRequest("https://www.goodreads.com/list/show/42");
    const response = new HttpResponse(request, new HttpHeader(), "", 500);
    const listInfo: IProvideListInfo = {
      getListInfo: vi.fn(async () => {
        throw new HttpException(request, response);
      }),
    };
    const { subject } = buildSubject(listInfo);

    const result = await subject.test();

    expect(result.errors[0]?.errorMessage).toBe("Could not get list data");
  });

  it("test() succeeds when getListInfo resolves without error", async () => {
    const listInfo: IProvideListInfo = {
      getListInfo: vi.fn(async () => ({ foreignListId: "42", name: "list", page: 1, books: [] })),
    };
    const { subject } = buildSubject(listInfo);

    const result = await subject.test();

    expect(result.isValid).toBe(true);
  });
});

import type { ImportListItemInfo } from "../parser/model/importListItemInfo.js";
import type { IImportListFactory } from "./ImportListFactory.js";
import type { ImportListDefinition } from "./ImportListDefinition.js";
import type { IImportListStatusService } from "./ImportListStatusService.js";

/** Minimal logger surface this service needs. */
export interface FetchAndParseImportListLogger {
  trace(message: string, ...args: unknown[]): void;
  debug(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

const noopLogger: FetchAndParseImportListLogger = {
  trace: () => {},
  debug: () => {},
  error: () => {},
};

/**
 * Ported from NzbDrone.Core/ImportLists/FetchAndParseImportListService.cs.
 *
 * DEVIATION -- concurrency: C# fans every enabled import list's `Fetch()`
 * out onto its own long-running `Task` (`TaskFactory(LongRunning)`), guards
 * the shared `result` list with a `lock`, then `Task.WaitAll`s. Node has no
 * threads to race over a shared array in the first place -- this port uses
 * `Promise.all` over each list's own async `fetch()` (already async per
 * this module's `IImportList.fetch()` -- see `IImportList.ts`'s doc
 * comment), which achieves the same "run every list's fetch concurrently,
 * wait for all of them, one list's failure doesn't abort the others"
 * behavior without needing a lock (each fetch's results are collected into
 * its own local array and merged into `result` only after that fetch's
 * promise settles, so there's no interleaved-write hazard even though
 * everything shares one JS thread).
 */
export interface IFetchAndParseImportList {
  fetch(): Promise<ImportListItemInfo[]>;
  fetchSingleList(definition: ImportListDefinition): Promise<ImportListItemInfo[]>;
}

export class FetchAndParseImportListService implements IFetchAndParseImportList {
  constructor(
    private readonly importListFactory: IImportListFactory,
    private readonly importListStatusService: IImportListStatusService,
    private readonly logger: FetchAndParseImportListLogger = noopLogger,
    /** Injectable clock seam for `MinRefreshInterval` gating -- tests control "now" without faking Date globally. */
    private readonly now: () => number = () => Date.now()
  ) {}

  /** Ported from FetchAndParseImportListService.Fetch(). */
  async fetch(): Promise<ImportListItemInfo[]> {
    let result: ImportListItemInfo[] = [];

    const importLists = this.importListFactory.automaticAddEnabled();

    if (importLists.length === 0) {
      this.logger.debug("No enabled import lists, skipping.");
      return result;
    }

    this.logger.debug("Available import lists %d", importLists.length);

    const tasks = importLists.map(async (importList) => {
      const lastSync = this.importListStatusService.getLastSyncListInfo(importList.definition.id);

      if (lastSync !== null) {
        const nextSyncMs = new Date(lastSync).getTime() + importList.minRefreshIntervalMs;

        if (this.now() < nextSyncMs) {
          this.logger.trace(
            "Skipping refresh of Import List %s (%s) due to minimum refresh interval. Next sync after %s",
            importList.name,
            importList.definition.name,
            new Date(nextSyncMs).toISOString()
          );
          return [] as ImportListItemInfo[];
        }
      }

      try {
        const importListReports = await importList.fetch();

        this.logger.debug(
          "Found %d reports from %s (%s)",
          importListReports.length,
          importList.name,
          importList.definition.name
        );

        this.importListStatusService.updateListSyncStatus(importList.definition.id);

        return importListReports;
      } catch (e) {
        this.logger.error(
          "Error during Import List Sync of %s (%s): %s",
          importList.name,
          importList.definition.name,
          e
        );
        return [] as ImportListItemInfo[];
      }
    });

    const settled = await Promise.all(tasks);
    result = settled.flat();

    result = distinctByAuthorBook(result);

    this.logger.debug("Found %d total reports from %d lists", result.length, importLists.length);

    return result;
  }

  /** Ported from FetchAndParseImportListService.FetchSingleList(ImportListDefinition). */
  async fetchSingleList(definition: ImportListDefinition): Promise<ImportListItemInfo[]> {
    const importList = this.importListFactory.getInstance(definition);

    if (!importList || !definition.enableAutomaticAdd) {
      this.logger.debug(
        "Import List %s (%s) is not enabled, skipping.",
        importList?.name,
        importList?.definition.name
      );
      return [];
    }

    let result: ImportListItemInfo[] = [];

    try {
      const importListReports = await importList.fetch();

      this.logger.debug(
        "Found %d reports from %s (%s)",
        importListReports.length,
        importList.name,
        importList.definition.name
      );

      result = importListReports;

      this.importListStatusService.updateListSyncStatus(importList.definition.id);
    } catch (e) {
      this.logger.error(
        "Error during Import List Sync of %s (%s): %s",
        importList.name,
        importList.definition.name,
        e
      );
    }

    return distinctByAuthorBook(result);
  }
}

/** Ported from `.DistinctBy(r => new { r.Author, r.Book })`, keeping the first occurrence. */
function distinctByAuthorBook(items: ImportListItemInfo[]): ImportListItemInfo[] {
  const seen = new Set<string>();
  const result: ImportListItemInfo[] = [];

  for (const item of items) {
    const key = `${item.author ?? ""} ${item.book ?? ""}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(item);
    }
  }

  return result;
}

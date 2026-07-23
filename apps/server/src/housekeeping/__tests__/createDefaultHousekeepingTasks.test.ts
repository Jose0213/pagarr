import { describe, expect, it, afterEach, beforeEach, vi } from "vitest";
import {
  createTestDatabase,
  createTestCacheDatabase,
  DEFAULT_LOG_MIGRATIONS_DIR,
} from "./testDb.js";
import {
  createLogDatabase,
  type MainDatabase,
  type CacheDatabase,
  type LogDatabase,
} from "../../db/db-factory.js";
import { CommandQueueManager } from "../../messaging/commands/commandQueueManager.js";
import { CommandRepository } from "../../messaging/commands/commandRepository.js";
import { IndexerStatusRepository } from "../../indexers/IndexerStatusRepository.js";
import { DownloadClientStatusRepository } from "../../download-clients/DownloadClientStatusRepository.js";
import { QualityProfileRepository } from "../../profiles/qualities/qualityProfileRepository.js";
import { LogRepository } from "../../instrumentation/logRepository.js";
import { AuthorRepository } from "../../books/authorRepository.js";
import { HousekeepingDiskProvider } from "../diskProvider.js";
import { createDefaultHousekeepingTasks } from "../housekeepers/index.js";
import { HousekeepingService } from "../housekeepingService.js";
import { HousekeepingCommand } from "../housekeepingCommand.js";

/**
 * End-to-end smoke test: builds the real default task list against real
 * (in-memory) databases and confirms `HousekeepingService` can run every
 * task without throwing -- the same shape `HousekeepingCommand`/the
 * scheduler would trigger in the real app.
 */
describe("createDefaultHousekeepingTasks", () => {
  let mainDatabase: MainDatabase;
  let cacheDatabase: CacheDatabase;
  let logDatabase: LogDatabase;

  beforeEach(() => {
    mainDatabase = createTestDatabase();
    cacheDatabase = createTestCacheDatabase();
    logDatabase = createLogDatabase(":memory:", DEFAULT_LOG_MIGRATIONS_DIR);
  });

  afterEach(() => {
    mainDatabase.close();
    cacheDatabase.close();
    logDatabase.close();
  });

  function buildTasks() {
    const commandQueueManager = new CommandQueueManager(new CommandRepository(mainDatabase));
    return createDefaultHousekeepingTasks({
      mainDatabase,
      cacheDatabase,
      commandQueueManager,
      indexerStatusRepository: new IndexerStatusRepository(mainDatabase),
      downloadClientStatusRepository: new DownloadClientStatusRepository(mainDatabase),
      qualityProfileRepository: new QualityProfileRepository(mainDatabase),
      customFormatRepository: { all: () => [] },
      logRepository: new LogRepository(logDatabase),
      authorRepository: new AuthorRepository(mainDatabase),
      metadataFileService: { getFilesByAuthor: () => [], delete: () => {} },
      authorService: { allAuthorPaths: () => new Map() },
      configService: { cleanupMetadataImages: false } as never,
      diskProvider: new HousekeepingDiskProvider(),
    });
  }

  it("builds exactly 32 concrete tasks (33 real Housekeepers/*.cs files minus FixFutureProviderStatusTimes.cs, which is `abstract class FixFutureProviderStatusTimes<TModel> where TModel : ProviderStatusBase, new()` in C# -- never itself registered as a concrete IHousekeepingTask, only its four Fix*StatusTimes subclasses are)", () => {
    const tasks = buildTasks();
    expect(tasks).toHaveLength(32);
  });

  it("runs the full real default task list end to end via HousekeepingService without throwing", async () => {
    const tasks = buildTasks();
    const onTaskError = vi.fn();
    const service = new HousekeepingService(tasks, mainDatabase, undefined, onTaskError);

    await service.execute(new HousekeepingCommand());

    expect(onTaskError).not.toHaveBeenCalled();
  });
});

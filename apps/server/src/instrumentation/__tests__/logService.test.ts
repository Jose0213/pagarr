import { describe, expect, it } from "vitest";
import {
  createLogDatabase,
  DEFAULT_LOG_MIGRATIONS_DIR,
  type LogDatabase,
} from "../../db/db-factory.js";
import { LogRepository } from "../logRepository.js";
import { LogService } from "../logService.js";
import { ClearLogCommand } from "../commands.js";
import { PagingSpec } from "../../db/paging-spec.js";
import type { Log } from "../log.js";

function makeDatabase(): LogDatabase {
  return createLogDatabase(":memory:", DEFAULT_LOG_MIGRATIONS_DIR);
}

function baseLog(overrides: Partial<Log> = {}): Log {
  return {
    id: 0,
    message: "hello world",
    time: new Date().toISOString(),
    logger: "TestLogger",
    exception: null,
    exceptionType: null,
    level: "Info",
    ...overrides,
  };
}

describe("LogService", () => {
  it("paged() delegates to LogRepository.getPaged()", () => {
    const db = makeDatabase();
    const repo = new LogRepository(db);
    const service = new LogService(repo);

    repo.insert(baseLog({ message: "one" }));
    repo.insert(baseLog({ message: "two" }));
    repo.insert(baseLog({ message: "three" }));

    const pagingSpec = new PagingSpec<Log>();
    pagingSpec.page = 1;
    pagingSpec.pageSize = 2;

    const result = service.paged(pagingSpec);

    expect(result.totalRecords).toBe(3);
    expect(result.records).toHaveLength(2);
  });

  it("execute(ClearLogCommand) purges every log row (Purge(vacuum: true))", () => {
    const db = makeDatabase();
    const repo = new LogRepository(db);
    const service = new LogService(repo);

    repo.insert(baseLog());
    repo.insert(baseLog());

    service.execute(new ClearLogCommand());

    expect(repo.all()).toHaveLength(0);
  });
});

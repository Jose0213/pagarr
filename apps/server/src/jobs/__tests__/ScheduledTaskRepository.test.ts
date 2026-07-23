import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import { Database, type IDatabase } from "../../db/database.js";
import { CommandPriority } from "../CommandPriority.js";
import { createScheduledTask } from "../ScheduledTask.js";
import { ScheduledTaskRepository } from "../ScheduledTaskRepository.js";

function makeDatabase(): IDatabase {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    CREATE TABLE "ScheduledTasks" (
      "Id" INTEGER PRIMARY KEY,
      "TypeName" TEXT NOT NULL UNIQUE,
      "Interval" INTEGER NOT NULL,
      "LastExecution" TEXT NOT NULL,
      "LastStartTime" TEXT NULL
    );
  `);
  return new Database("Test", sqlite);
}

describe("ScheduledTaskRepository", () => {
  let db: IDatabase;
  let repo: ScheduledTaskRepository;

  beforeEach(() => {
    db = makeDatabase();
    repo = new ScheduledTaskRepository(db);
  });

  it("round-trips typeName/interval/lastExecution/lastStartTime through insert + get", () => {
    const now = new Date().toISOString();
    const inserted = repo.insert(
      createScheduledTask({ typeName: "MyCommand", interval: 5, lastExecution: now })
    );
    expect(inserted.id).toBeGreaterThan(0);

    const stored = repo.get(inserted.id);
    expect(stored.typeName).toBe("MyCommand");
    expect(stored.interval).toBe(5);
    expect(stored.lastExecution).toBe(now);
  });

  it("priority is not a persisted column -- always reads back as the default (CommandPriority.Low)", () => {
    const inserted = repo.insert(
      createScheduledTask({ typeName: "MyCommand", priority: CommandPriority.High })
    );

    // The in-memory model passed to insert() had High, but nothing in the
    // schema stores it -- a fresh read must NOT reflect that.
    expect(repo.get(inserted.id).priority).toBe(CommandPriority.Low);
  });

  it("getDefinition() finds the single matching row by typeName, matching Query(...).Single()", () => {
    repo.insert(createScheduledTask({ typeName: "RssSyncCommand" }));
    expect(repo.getDefinition("RssSyncCommand").typeName).toBe("RssSyncCommand");
  });

  it("getDefinition() throws when no task matches", () => {
    expect(() => repo.getDefinition("Nonexistent")).toThrow();
  });

  it("setLastExecutionTime() updates only LastExecution/LastStartTime, matching SetFields()", () => {
    const inserted = repo.insert(createScheduledTask({ typeName: "MyCommand", interval: 5 }));

    const newExecution = new Date(Date.now() + 60000).toISOString();
    const newStart = new Date(Date.now() + 61000).toISOString();
    repo.setLastExecutionTime(inserted.id, newExecution, newStart);

    const stored = repo.get(inserted.id);
    expect(stored.lastExecution).toBe(newExecution);
    expect(stored.lastStartTime).toBe(newStart);
    expect(stored.interval).toBe(5);
    expect(stored.typeName).toBe("MyCommand");
  });
});

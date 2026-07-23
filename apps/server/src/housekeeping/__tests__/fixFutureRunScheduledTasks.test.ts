import { describe, expect, it, afterEach, beforeEach, vi } from "vitest";
import { createTestDatabase } from "./testDb.js";
import type { MainDatabase } from "../../db/db-factory.js";
import { FixFutureRunScheduledTasks } from "../housekeepers/fixFutureRunScheduledTasks.js";

/** Ported from NzbDrone.Core/Housekeeping/Housekeepers/FixFutureRunScheduledTasks.cs. */
describe("FixFutureRunScheduledTasks", () => {
  let db: MainDatabase;

  beforeEach(() => {
    db = createTestDatabase();
  });

  afterEach(() => {
    db.close();
  });

  function insertScheduledTask(typeName: string, lastExecution: string): void {
    db.openConnection()
      .prepare(
        `INSERT INTO "ScheduledTasks" ("TypeName", "Interval", "LastExecution") VALUES (?, 60, ?)`
      )
      .run(typeName, lastExecution);
  }

  it("clamps a future LastExecution down to now", () => {
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    insertScheduledTask("FutureTask", future);

    new FixFutureRunScheduledTasks(db).clean();

    const row = db
      .openConnection()
      .prepare('SELECT "LastExecution" FROM "ScheduledTasks" WHERE "TypeName" = ?')
      .get("FutureTask") as { LastExecution: string };

    expect(new Date(row.LastExecution).getTime()).toBeLessThanOrEqual(Date.now());
    expect(row.LastExecution).not.toBe(future);
  });

  it("leaves a past/present LastExecution untouched", () => {
    const past = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    insertScheduledTask("PastTask", past);

    new FixFutureRunScheduledTasks(db).clean();

    const row = db
      .openConnection()
      .prepare('SELECT "LastExecution" FROM "ScheduledTasks" WHERE "TypeName" = ?')
      .get("PastTask") as { LastExecution: string };

    expect(row.LastExecution).toBe(past);
  });

  it("PRESERVED C# BUG: still runs the cleanup even when isDebug is true (the C# guard only logs, never returns early)", () => {
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    insertScheduledTask("FutureTask", future);
    const onDebugLog = vi.fn();

    new FixFutureRunScheduledTasks(db, true, onDebugLog).clean();

    expect(onDebugLog).toHaveBeenCalledWith(
      "Not running scheduled task last execution cleanup during debug"
    );
    const row = db
      .openConnection()
      .prepare('SELECT "LastExecution" FROM "ScheduledTasks" WHERE "TypeName" = ?')
      .get("FutureTask") as { LastExecution: string };
    expect(row.LastExecution).not.toBe(future);
  });
});

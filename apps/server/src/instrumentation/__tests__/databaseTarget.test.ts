import { describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import {
  createLogDatabase,
  DEFAULT_LOG_MIGRATIONS_DIR,
  type LogDatabase,
} from "../../db/db-factory.js";
import { DatabaseTarget, buildLogRow, type LogEventEntry } from "../databaseTarget.js";

function makeDatabase(): LogDatabase {
  return createLogDatabase(":memory:", DEFAULT_LOG_MIGRATIONS_DIR);
}

function queryLogs(db: LogDatabase): Array<{
  Message: string;
  Time: string;
  Logger: string;
  Exception: string | null;
  ExceptionType: string | null;
  Level: string;
}> {
  return db.openConnection().prepare('SELECT * FROM "Logs" ORDER BY "Id"').all() as never;
}

/**
 * Translated from NzbDrone.Core.Test/Instrumentation/DatabaseTargetFixture.cs's
 * behavioral cases (write_log, write_long_log, write_log_exception,
 * exception_log_with_no_message_should_use_exceptions_message) -- adapted
 * to call DatabaseTarget.write() directly with a plain LogEventEntry instead
 * of going through a real NLog Logger, since there's no NLog dispatch layer
 * in this port (see databaseTarget.ts's doc comment).
 */
describe("DatabaseTarget", () => {
  it("write_log: writes a single event to the Logs table", () => {
    const db = makeDatabase();
    const target = new DatabaseTarget(db);
    const uniqueMessage = "Unique message: " + randomUUID();

    target.write({
      time: new Date().toISOString(),
      loggerName: "TestLogger",
      level: "Info",
      message: uniqueMessage,
    });

    const rows = queryLogs(db);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.Message).toBe(uniqueMessage);
    expect(rows[0]!.Level).toBe("Info");
    expect(rows[0]!.Logger).toBe("TestLogger");
  });

  it("write_long_log: preserves a long message's full length", () => {
    const db = makeDatabase();
    const target = new DatabaseTarget(db);

    let message = "";
    for (let i = 0; i < 100; i++) {
      message += randomUUID();
    }

    target.write({
      time: new Date().toISOString(),
      loggerName: "TestLogger",
      level: "Info",
      message,
    });

    const rows = queryLogs(db);
    expect(rows[0]!.Message).toHaveLength(message.length);
    expect(rows[0]!.Message).toBe(message);
  });

  it("write_log_exception: folds the exception message into Message and stores Exception/ExceptionType", () => {
    const db = makeDatabase();
    const target = new DatabaseTarget(db);
    const uniqueMessage = "Unique message: " + randomUUID();

    target.write({
      time: new Date().toISOString(),
      loggerName: "TestLogger",
      level: "Error",
      message: uniqueMessage,
      exception: {
        message: "Fake Exception",
        stack: "InvalidOperationException: Fake Exception\n   at Test",
        typeName: "InvalidOperationException",
      },
    });

    const rows = queryLogs(db);
    expect(rows[0]!.Message).toBe(uniqueMessage + ": Fake Exception");
    expect(rows[0]!.ExceptionType).toBe("InvalidOperationException");
    expect(rows[0]!.Exception).toBe("InvalidOperationException: Fake Exception\n   at Test");
    expect(rows[0]!.Level).toBe("Error");
  });

  it("exception_log_with_no_message_should_use_exceptions_message: empty message falls back to exception.message", () => {
    const db = makeDatabase();
    const target = new DatabaseTarget(db);

    target.write({
      time: new Date().toISOString(),
      loggerName: "TestLogger",
      level: "Error",
      message: "",
      exception: {
        message: "Fake Exception",
        stack: "InvalidOperationException: Fake Exception",
        typeName: "InvalidOperationException",
      },
    });

    const rows = queryLogs(db);
    expect(rows[0]!.Message).toBe("Fake Exception");
  });

  it("strips a 'NzbDrone.' prefix from the logger name, matching the C# source's literal behavior", () => {
    const db = makeDatabase();
    const target = new DatabaseTarget(db);

    target.write({
      time: new Date().toISOString(),
      loggerName: "NzbDrone.Core.Instrumentation.DatabaseTarget",
      level: "Info",
      message: "test",
    });

    const rows = queryLogs(db);
    expect(rows[0]!.Logger).toBe("Core.Instrumentation.DatabaseTarget");
  });

  it("cleanses secrets out of the message before persisting", () => {
    const db = makeDatabase();
    const target = new DatabaseTarget(db);

    target.write({
      time: new Date().toISOString(),
      loggerName: "TestLogger",
      level: "Info",
      message: "http://127.0.0.1:1234/api/call?vv=1&apikey=mySecret",
    });

    const rows = queryLogs(db);
    expect(rows[0]!.Message).not.toContain("mySecret");
  });

  it("calls onWriteError and rethrows if the insert fails", () => {
    const db = makeDatabase();
    db.close(); // force the next openConnection()/prepare() to fail
    const onWriteError = vi.fn();
    const target = new DatabaseTarget(db, 500, onWriteError);

    expect(() =>
      target.write({
        time: new Date().toISOString(),
        loggerName: "TestLogger",
        level: "Info",
        message: "test",
      })
    ).toThrow();

    expect(onWriteError).toHaveBeenCalledTimes(1);
  });

  describe("buildLogRow", () => {
    it("is a pure transform matching write()'s row for the same input", () => {
      const entry: LogEventEntry = {
        time: "2026-01-01T00:00:00.000Z",
        loggerName: "NzbDrone.Foo",
        level: "Warn",
        message: "plain message",
      };

      expect(buildLogRow(entry)).toEqual({
        message: "plain message",
        time: "2026-01-01T00:00:00.000Z",
        logger: "Foo",
        exception: null,
        exceptionType: null,
        level: "Warn",
      });
    });
  });

  describe("writeBatched / flush", () => {
    it("coalesces multiple writeBatched() calls into rows written on flush()", () => {
      const db = makeDatabase();
      const target = new DatabaseTarget(db);

      target.writeBatched({
        time: new Date().toISOString(),
        loggerName: "TestLogger",
        level: "Info",
        message: "first",
      });
      target.writeBatched({
        time: new Date().toISOString(),
        loggerName: "TestLogger",
        level: "Info",
        message: "second",
      });

      // Nothing written yet -- buffered until flush.
      expect(queryLogs(db)).toHaveLength(0);

      target.flush();

      const rows = queryLogs(db);
      expect(rows).toHaveLength(2);
      expect(rows.map((r) => r.Message)).toEqual(["first", "second"]);
    });

    it("close() flushes any pending batched writes", () => {
      const db = makeDatabase();
      const target = new DatabaseTarget(db);

      target.writeBatched({
        time: new Date().toISOString(),
        loggerName: "TestLogger",
        level: "Info",
        message: "pending",
      });

      target.close();

      expect(queryLogs(db)).toHaveLength(1);
    });

    it("flush() with nothing pending is a no-op", () => {
      const db = makeDatabase();
      const target = new DatabaseTarget(db);

      expect(() => target.flush()).not.toThrow();
      expect(queryLogs(db)).toHaveLength(0);
    });

    it("scheduled flush via setTimeout eventually writes buffered entries", async () => {
      vi.useFakeTimers();
      try {
        const db = makeDatabase();
        const target = new DatabaseTarget(db, 50);

        target.writeBatched({
          time: new Date().toISOString(),
          loggerName: "TestLogger",
          level: "Info",
          message: "timed",
        });

        expect(queryLogs(db)).toHaveLength(0);

        vi.advanceTimersByTime(51);

        expect(queryLogs(db)).toHaveLength(1);
      } finally {
        vi.useRealTimers();
      }
    });
  });
});

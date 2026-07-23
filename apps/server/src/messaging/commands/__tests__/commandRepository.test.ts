import { describe, expect, it } from "vitest";
import { createMainDatabase, type MainDatabase } from "../../../db/db-factory.js";
import { Command } from "../command.js";
import { CommandRepository } from "../commandRepository.js";
import { CommandStatus } from "../commandStatus.js";
import { CommandResult } from "../commandResult.js";
import { CommandPriority } from "../commandPriority.js";
import { CommandTrigger } from "../commandTrigger.js";
import { newCommandModel } from "../commandModel.js";

/**
 * Uses the real ported migrations (0001_initial_setup.sql's Commands table
 * + 0036_add_result_to_commands.sql's Result column) against an in-memory
 * sqlite db -- see root-folders/root-folder-repository.test.ts's identical
 * approach and doc comment.
 */
function makeDatabase(): MainDatabase {
  return createMainDatabase(":memory:");
}

class SampleCommand extends Command {
  bookId = 7;
}

describe("CommandRepository", () => {
  it("inserts and round-trips a command, preserving Body as JSON", () => {
    const db = makeDatabase();
    const repo = new CommandRepository(db);

    const model = newCommandModel({ body: new SampleCommand() });
    const inserted = repo.insert(model);

    expect(inserted.id).toBeGreaterThan(0);
    expect(inserted.name).toBe("Sample");
    expect((inserted.body as unknown as { bookId: number }).bookId).toBe(7);
    expect(inserted.status).toBe(CommandStatus.Queued);
    expect(inserted.message).toBeNull();

    const fetched = repo.get(inserted.id);
    expect((fetched.body as unknown as { bookId: number }).bookId).toBe(7);
  });

  it("start()/end() persist only the fields C# SetFields touches", () => {
    const db = makeDatabase();
    const repo = new CommandRepository(db);

    const inserted = repo.insert(newCommandModel({ body: new SampleCommand() }));

    inserted.startedAt = new Date().toISOString();
    inserted.status = CommandStatus.Started;
    repo.start(inserted);

    const afterStart = repo.get(inserted.id);
    expect(afterStart.status).toBe(CommandStatus.Started);
    expect(afterStart.startedAt).toBe(inserted.startedAt);

    inserted.endedAt = new Date().toISOString();
    inserted.status = CommandStatus.Completed;
    inserted.duration = 1500;
    inserted.exception = null;
    repo.end(inserted);

    const afterEnd = repo.get(inserted.id);
    expect(afterEnd.status).toBe(CommandStatus.Completed);
    expect(afterEnd.duration).toBe(1500);
  });

  it("round-trips Duration through the TimeSpan-shaped TEXT column", () => {
    const db = makeDatabase();
    const repo = new CommandRepository(db);

    const inserted = repo.insert(newCommandModel({ body: new SampleCommand() }));
    inserted.endedAt = new Date().toISOString();
    inserted.status = CommandStatus.Completed;
    inserted.duration = 3661500; // 1h 1m 1.5s
    inserted.exception = null;
    repo.end(inserted);

    const row = db
      .openConnection()
      .prepare('SELECT "Duration" FROM "Commands" WHERE "Id" = ?')
      .get(inserted.id) as { Duration: string };

    expect(row.Duration).toBe("01:01:01.5000000");
    expect(repo.get(inserted.id).duration).toBe(3661500);
  });

  it("orphanStarted() flips every Started command to Orphaned", () => {
    const db = makeDatabase();
    const repo = new CommandRepository(db);

    const started = repo.insert(
      newCommandModel({ body: new SampleCommand(), status: CommandStatus.Started })
    );
    const queued = repo.insert(
      newCommandModel({ body: new SampleCommand(), status: CommandStatus.Queued })
    );

    repo.orphanStarted();

    expect(repo.get(started.id).status).toBe(CommandStatus.Orphaned);
    expect(repo.get(queued.id).status).toBe(CommandStatus.Queued);
  });

  it("queued() returns only Queued commands", () => {
    const db = makeDatabase();
    const repo = new CommandRepository(db);

    repo.insert(newCommandModel({ body: new SampleCommand(), status: CommandStatus.Queued }));
    repo.insert(newCommandModel({ body: new SampleCommand(), status: CommandStatus.Completed }));

    expect(repo.queued()).toHaveLength(1);
  });

  it("trim() deletes commands that ended more than a day ago, keeps recent ones", () => {
    const db = makeDatabase();
    const repo = new CommandRepository(db);

    const old = repo.insert(
      newCommandModel({
        body: new SampleCommand(),
        status: CommandStatus.Completed,
        endedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      })
    );
    const recent = repo.insert(
      newCommandModel({
        body: new SampleCommand(),
        status: CommandStatus.Completed,
        endedAt: new Date().toISOString(),
      })
    );

    repo.trim();

    expect(repo.find(old.id)).toBeUndefined();
    expect(repo.find(recent.id)).not.toBeUndefined();
  });

  it("preserves priority, result, and trigger enum values across the round trip", () => {
    const db = makeDatabase();
    const repo = new CommandRepository(db);

    const inserted = repo.insert(
      newCommandModel({
        body: new SampleCommand(),
        priority: CommandPriority.High,
        result: CommandResult.Successful,
        trigger: CommandTrigger.Manual,
      })
    );

    const fetched = repo.get(inserted.id);
    expect(fetched.priority).toBe(CommandPriority.High);
    expect(fetched.result).toBe(CommandResult.Successful);
    expect(fetched.trigger).toBe(CommandTrigger.Manual);
  });
});

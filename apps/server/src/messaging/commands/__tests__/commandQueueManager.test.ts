import { describe, expect, it, vi } from "vitest";
import { Command } from "../command.js";
import { CommandQueueManager } from "../commandQueueManager.js";
import type { ICommandRepository } from "../commandRepository.js";
import { CommandStatus } from "../commandStatus.js";
import { CommandPriority } from "../commandPriority.js";
import { CommandNotFoundException } from "../commandNotFoundException.js";
import type { CommandModel } from "../commandModel.js";

/** Ported from NzbDrone.Core.Test/Messaging/Commands/CommandQueueManagerFixture.cs plus additional coverage. */

class RefreshMonitoredDownloadsCommand extends Command {}
class OtherCommand extends Command {}

function makeRepo(): ICommandRepository {
  let id = 0;
  const commands: CommandModel[] = [];

  return {
    all: () => [...commands],
    find: (findId: number) => commands.find((c) => c.id === findId),
    get: (getId: number) => {
      const found = commands.find((c) => c.id === getId);
      if (!found) {
        throw new Error("not found");
      }
      return found;
    },
    getMany: (ids: number[]) => commands.filter((c) => ids.includes(c.id)),
    insert: (model: CommandModel) => {
      id += 1;
      const inserted = { ...model, id };
      commands.push(inserted);
      return inserted;
    },
    insertMany: (models: CommandModel[]) => {
      return models.map((model) => {
        id += 1;
        const inserted = { ...model, id };
        commands.push(inserted);
        return inserted;
      });
    },
    update: (model: CommandModel) => model,
    delete: vi.fn(),
    count: () => commands.length,
    hasItems: () => commands.length > 0,
    trim: vi.fn(),
    orphanStarted: vi.fn(),
    queued: () => commands.filter((c) => c.status === CommandStatus.Queued),
    start: vi.fn(),
    end: vi.fn(),
  };
}

describe("CommandQueueManager", () => {
  it("should_not_remove_commands_for_five_minutes_after_they_end", () => {
    const repo = makeRepo();
    const subject = new CommandQueueManager(repo);

    const command = subject.push(new RefreshMonitoredDownloadsCommand());

    // Start the command to mimic CommandQueue's behaviour
    command.startedAt = new Date().toISOString();
    command.status = CommandStatus.Started;

    subject.start(command);
    subject.complete(command, "All done");
    subject.cleanCommands();

    expect(subject.get(command.id)).not.toBeUndefined();
    expect(repo.trim).toHaveBeenCalledTimes(1);
  });

  describe("push", () => {
    it("inserts a new command with Normal priority and Unspecified trigger by default", () => {
      const repo = makeRepo();
      const subject = new CommandQueueManager(repo);

      const result = subject.push(new RefreshMonitoredDownloadsCommand());

      expect(result.priority).toBe(CommandPriority.Normal);
      expect(result.status).toBe(CommandStatus.Queued);
      expect(result.id).toBeGreaterThan(0);
    });

    it("returns the existing command instead of inserting a duplicate when an equal command is queued", () => {
      const repo = makeRepo();
      const subject = new CommandQueueManager(repo);

      const first = subject.push(new RefreshMonitoredDownloadsCommand());
      const second = subject.push(new RefreshMonitoredDownloadsCommand());

      expect(second.id).toBe(first.id);
      expect(repo.all()).toHaveLength(1);
    });

    it("does not dedupe commands of different types", () => {
      const repo = makeRepo();
      const subject = new CommandQueueManager(repo);

      subject.push(new RefreshMonitoredDownloadsCommand());
      subject.push(new OtherCommand());

      expect(repo.all()).toHaveLength(2);
    });

    it("throws when pushing a null/undefined command", () => {
      const repo = makeRepo();
      const subject = new CommandQueueManager(repo);

      // @ts-expect-error -- exercising the runtime null guard
      expect(() => subject.push(null)).toThrow();
    });
  });

  describe("pushMany", () => {
    it("inserts every non-duplicate command and skips ones already queued", () => {
      const repo = makeRepo();
      const subject = new CommandQueueManager(repo);

      subject.push(new RefreshMonitoredDownloadsCommand());

      const results = subject.pushMany([
        new RefreshMonitoredDownloadsCommand(),
        new OtherCommand(),
      ]);

      expect(results).toHaveLength(1);
      expect(results[0]?.body).toBeInstanceOf(OtherCommand);
    });
  });

  describe("pushByName / registerCommandType", () => {
    it("throws CommandNotFoundException for an unregistered command name", () => {
      const repo = makeRepo();
      const subject = new CommandQueueManager(repo);

      expect(() => subject.pushByName("NoSuchCommand", null, null)).toThrow(
        CommandNotFoundException
      );
    });

    it("resolves a registered command type case-insensitively and strips a namespace prefix", () => {
      const repo = makeRepo();
      const subject = new CommandQueueManager(repo);
      subject.registerCommandType(
        "RefreshMonitoredDownloads",
        () => new RefreshMonitoredDownloadsCommand()
      );

      const result = subject.pushByName("some.namespace.refreshmonitoreddownloads", null, null);

      expect(result.body).toBeInstanceOf(RefreshMonitoredDownloadsCommand);
    });
  });

  describe("cancel", () => {
    it("removes a queued command", () => {
      const repo = makeRepo();
      const subject = new CommandQueueManager(repo);
      const command = subject.push(new RefreshMonitoredDownloadsCommand());

      subject.cancel(command.id);

      expect(subject.all().find((c) => c.id === command.id)).toBeUndefined();
    });

    it("throws when the command isn't queued (already started, or unknown)", () => {
      const repo = makeRepo();
      const subject = new CommandQueueManager(repo);

      expect(() => subject.cancel(999)).toThrow();
    });
  });

  describe("fail", () => {
    it("stores the error's stack/message on the command and marks it Failed", () => {
      const repo = makeRepo();
      const subject = new CommandQueueManager(repo);
      const command = subject.push(new RefreshMonitoredDownloadsCommand());
      command.startedAt = new Date().toISOString();

      subject.fail(command, "Failed", new Error("boom"));

      expect(command.status).toBe(CommandStatus.Failed);
      expect(command.exception).toContain("boom");
      expect(repo.end).toHaveBeenCalled();
    });
  });

  describe("handleApplicationStarted", () => {
    it("orphans started commands and requeues queued ones", () => {
      const repo = makeRepo();
      const subject = new CommandQueueManager(repo);
      subject.push(new RefreshMonitoredDownloadsCommand());

      subject.handleApplicationStarted();

      expect(repo.orphanStarted).toHaveBeenCalledTimes(1);
      // requeue() re-adds every repo.queued() command into the in-memory queue.
      expect(subject.all().length).toBeGreaterThanOrEqual(1);
    });
  });
});

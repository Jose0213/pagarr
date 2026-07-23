import { describe, expect, it, vi } from "vitest";
import { Command } from "../command.js";
import { CommandQueue } from "../commandQueue.js";
import { CommandStatus } from "../commandStatus.js";
import { newCommandModel } from "../commandModel.js";

/** Ported from NzbDrone.Core.Test/Messaging/Commands/CommandQueueFixture.cs. */

class ProcessMonitoredDownloadsCommand extends Command {
  override get requiresDiskAccess(): boolean {
    return true;
  }
  override get isLongRunning(): boolean {
    return true;
  }
}

class RssSyncCommand extends Command {
  override get isLongRunning(): boolean {
    return true;
  }
}

class ImportListSyncCommand extends Command {
  override get isTypeExclusive(): boolean {
    return true;
  }
}

class ApplicationUpdateCommand extends Command {
  override get isExclusive(): boolean {
    return true;
  }
}

class RefreshAuthorCommand extends Command {}

describe("CommandQueue", () => {
  function givenStartedDiskCommand(subject: CommandQueue): void {
    subject.add(
      newCommandModel({
        name: "ProcessMonitoredDownloads",
        body: new ProcessMonitoredDownloadsCommand(),
        status: CommandStatus.Started,
      })
    );
  }

  function givenLongRunningCommand(subject: CommandQueue): void {
    subject.add(
      newCommandModel({
        name: "RssSync",
        body: new RssSyncCommand(),
        status: CommandStatus.Started,
      })
    );
  }

  function givenStartedTypeExclusiveCommand(subject: CommandQueue): void {
    subject.add(
      newCommandModel({
        name: "ImportListSync",
        body: new ImportListSyncCommand(),
        status: CommandStatus.Started,
      })
    );
  }

  function givenStartedExclusiveCommand(subject: CommandQueue): void {
    subject.add(
      newCommandModel({
        name: "ApplicationUpdate",
        body: new ApplicationUpdateCommand(),
        status: CommandStatus.Started,
      })
    );
  }

  it("should_not_return_disk_access_command_if_another_running", () => {
    const subject = new CommandQueue();
    givenStartedDiskCommand(subject);

    subject.add(
      newCommandModel({
        name: "ProcessMonitoredDownloads",
        body: new ProcessMonitoredDownloadsCommand(),
      })
    );

    expect(subject.tryGet()).toBeUndefined();
  });

  it("should_not_return_type_exclusive_command_if_another_running", () => {
    const subject = new CommandQueue();
    givenStartedTypeExclusiveCommand(subject);

    subject.add(newCommandModel({ name: "ImportListSync", body: new ImportListSyncCommand() }));

    expect(subject.tryGet()).toBeUndefined();
  });

  it("should_not_return_exclusive_command_if_long_running_command_running", () => {
    const subject = new CommandQueue();
    givenLongRunningCommand(subject);

    subject.add(
      newCommandModel({ name: "ApplicationUpdate", body: new ApplicationUpdateCommand() })
    );

    expect(subject.tryGet()).toBeUndefined();
  });

  it("should_not_return_type_exclusive_command_if_another_and_disk_access_command_running", () => {
    const subject = new CommandQueue();
    givenStartedTypeExclusiveCommand(subject);
    givenStartedDiskCommand(subject);

    subject.add(newCommandModel({ name: "ImportListSync", body: new ImportListSyncCommand() }));

    expect(subject.tryGet()).toBeUndefined();
  });

  it("should_return_type_exclusive_command_if_another_not_running", () => {
    const subject = new CommandQueue();
    givenStartedDiskCommand(subject);

    subject.add(newCommandModel({ name: "ImportListSync", body: new ImportListSyncCommand() }));

    const command = subject.tryGet();

    expect(command).not.toBeUndefined();
    expect(command?.status).toBe(CommandStatus.Started);
  });

  it("should_return_regular_command_if_type_exclusive_command_running", () => {
    const subject = new CommandQueue();
    givenStartedTypeExclusiveCommand(subject);

    subject.add(newCommandModel({ name: "RefreshAuthor", body: new RefreshAuthorCommand() }));

    const command = subject.tryGet();

    expect(command).not.toBeUndefined();
    expect(command?.status).toBe(CommandStatus.Started);
  });

  it("should_not_return_exclusive_command_if_any_running", () => {
    const subject = new CommandQueue();
    givenStartedDiskCommand(subject);

    subject.add(
      newCommandModel({ name: "ApplicationUpdate", body: new ApplicationUpdateCommand() })
    );

    expect(subject.tryGet()).toBeUndefined();
  });

  it("should_not_return_any_command_if_exclusive_running", () => {
    const subject = new CommandQueue();
    givenStartedExclusiveCommand(subject);

    subject.add(newCommandModel({ name: "RefreshAuthor", body: new RefreshAuthorCommand() }));

    expect(subject.tryGet()).toBeUndefined();
  });

  it("should_return_null_if_nothing_queued", () => {
    const subject = new CommandQueue();
    givenStartedDiskCommand(subject);

    expect(subject.tryGet()).toBeUndefined();
  });

  it("returns queued commands ordered by priority descending, then queuedAt ascending", () => {
    const subject = new CommandQueue();
    const low = newCommandModel({
      name: "RefreshAuthor",
      body: new RefreshAuthorCommand(),
      priority: -1,
      queuedAt: "2026-01-01T00:00:02.000Z",
    });
    const high = newCommandModel({
      name: "RefreshAuthor",
      body: new RefreshAuthorCommand(),
      priority: 1,
      queuedAt: "2026-01-01T00:00:01.000Z",
    });
    const normalEarlier = newCommandModel({
      name: "RefreshAuthor",
      body: new RefreshAuthorCommand(),
      priority: 0,
      queuedAt: "2026-01-01T00:00:00.000Z",
    });

    subject.add(low);
    subject.add(normalEarlier);
    subject.add(high);

    expect(subject.tryGet()).toBe(high);
  });

  describe("getConsumingEnumerable", () => {
    it("yields commands as they're added and stops on abort", async () => {
      const subject = new CommandQueue();
      const controller = new AbortController();
      const seen: string[] = [];

      const consumer = (async () => {
        for await (const command of subject.getConsumingEnumerable(controller.signal)) {
          seen.push(command.name);
        }
      })();

      subject.add(newCommandModel({ name: "RefreshAuthor", body: new RefreshAuthorCommand() }));

      await vi.waitFor(() => expect(seen).toEqual(["RefreshAuthor"]));

      controller.abort();
      await consumer;

      expect(seen).toEqual(["RefreshAuthor"]);
    });

    it("does not yield anything once aborted before an item is available", async () => {
      const subject = new CommandQueue();
      const controller = new AbortController();
      controller.abort();

      const seen: string[] = [];
      for await (const command of subject.getConsumingEnumerable(controller.signal)) {
        seen.push(command.name);
      }

      expect(seen).toEqual([]);
    });
  });

  describe("removeIfQueued", () => {
    it("removes a queued command and returns true", () => {
      const subject = new CommandQueue();
      const model = newCommandModel({ name: "RefreshAuthor", body: new RefreshAuthorCommand() });
      subject.add(model);

      expect(subject.removeIfQueued(model.id)).toBe(true);
      expect(subject.find(model.id)).toBeUndefined();
    });

    it("returns false for a started (non-queued) command", () => {
      const subject = new CommandQueue();
      const model = newCommandModel({
        name: "RefreshAuthor",
        body: new RefreshAuthorCommand(),
        status: CommandStatus.Started,
      });
      subject.add(model);

      expect(subject.removeIfQueued(model.id)).toBe(false);
    });

    it("returns false for an unknown id", () => {
      const subject = new CommandQueue();
      expect(subject.removeIfQueued(999)).toBe(false);
    });
  });

  describe("queuedOrStarted", () => {
    it("includes only Queued and Started commands", () => {
      const subject = new CommandQueue();
      subject.add(
        newCommandModel({
          name: "A",
          body: new RefreshAuthorCommand(),
          status: CommandStatus.Queued,
        })
      );
      subject.add(
        newCommandModel({
          name: "B",
          body: new RefreshAuthorCommand(),
          status: CommandStatus.Started,
        })
      );
      subject.add(
        newCommandModel({
          name: "C",
          body: new RefreshAuthorCommand(),
          status: CommandStatus.Completed,
        })
      );

      expect(subject.queuedOrStarted().map((c) => c.name)).toEqual(["A", "B"]);
    });
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { ProgressMessageTarget } from "../progressMessageTarget.js";
import { CommandUpdatedEvent } from "../commandUpdatedEvent.js";
import { ProgressMessageContext } from "../../messaging/commands/progressMessageContext.js";
import { newCommandModel, type CommandModel } from "../../messaging/commands/commandModel.js";
import { MessagingCleanupCommand } from "../../messaging/commands/messagingCleanupCommand.js";
import { TestCommand } from "../../messaging/commands/testCommand.js";
import type { IManageCommandQueue } from "../../messaging/commands/commandQueueManager.js";
import type { IEventAggregator } from "../../messaging/events/iEventAggregator.js";

function fakeCommandQueueManager(): IManageCommandQueue {
  return {
    pushMany: vi.fn(),
    push: vi.fn(),
    pushByName: vi.fn(),
    queue: vi.fn(),
    all: vi.fn(),
    get: vi.fn(),
    getStarted: vi.fn(),
    setMessage: vi.fn(),
    setResult: vi.fn(),
    start: vi.fn(),
    complete: vi.fn(),
    fail: vi.fn(),
    requeue: vi.fn(),
    cancel: vi.fn(),
    cleanCommands: vi.fn(),
  };
}

function fakeEventAggregator(): IEventAggregator {
  return { publishEvent: vi.fn() };
}

describe("ProgressMessageTarget", () => {
  afterEach(() => {
    ProgressMessageContext.commandModel = null;
    ProgressMessageContext.unlockReentrancy();
  });

  it("does nothing when there is no currently-executing command", () => {
    const commandQueueManager = fakeCommandQueueManager();
    const eventAggregator = fakeEventAggregator();
    const target = new ProgressMessageTarget(eventAggregator, commandQueueManager);

    target.write({ message: "hello", hasStatusProperty: true });

    expect(commandQueueManager.setMessage).not.toHaveBeenCalled();
    expect(eventAggregator.publishEvent).not.toHaveBeenCalled();
  });

  it("does nothing when the current command's body doesn't want client updates", () => {
    const commandQueueManager = fakeCommandQueueManager();
    const eventAggregator = fakeEventAggregator();
    const target = new ProgressMessageTarget(eventAggregator, commandQueueManager);

    // MessagingCleanupCommand doesn't override sendUpdatesToClient -> false by default.
    ProgressMessageContext.commandModel = newCommandModel({ body: new MessagingCleanupCommand() });

    target.write({ message: "hello", hasStatusProperty: true });

    expect(commandQueueManager.setMessage).not.toHaveBeenCalled();
  });

  it("does nothing when the log event has no Status property", () => {
    const commandQueueManager = fakeCommandQueueManager();
    const eventAggregator = fakeEventAggregator();
    const target = new ProgressMessageTarget(eventAggregator, commandQueueManager);

    ProgressMessageContext.commandModel = newCommandModel({ body: new TestCommand() });

    target.write({ message: "hello", hasStatusProperty: false });

    expect(commandQueueManager.setMessage).not.toHaveBeenCalled();
  });

  it("sets the command's message and publishes CommandUpdatedEvent for a qualifying status message", () => {
    const commandQueueManager = fakeCommandQueueManager();
    const eventAggregator = fakeEventAggregator();
    const target = new ProgressMessageTarget(eventAggregator, commandQueueManager);

    const command = newCommandModel({ body: new TestCommand() });
    ProgressMessageContext.commandModel = command;

    target.write({ message: "50% complete", hasStatusProperty: true });

    expect(commandQueueManager.setMessage).toHaveBeenCalledWith(command, "50% complete");
    expect(eventAggregator.publishEvent).toHaveBeenCalledWith(new CommandUpdatedEvent(command));
  });

  it("skips (reentrancy guard) when already inside a write", () => {
    const commandQueueManager = fakeCommandQueueManager();
    const eventAggregator = fakeEventAggregator();
    const target = new ProgressMessageTarget(eventAggregator, commandQueueManager);

    const command = newCommandModel({ body: new TestCommand() });
    ProgressMessageContext.commandModel = command;

    // Simulate an in-progress write (e.g. this write() call itself triggered
    // a nested log call synchronously) by locking reentrancy up front.
    expect(ProgressMessageContext.lockReentrancy()).toBe(true);

    target.write({ message: "nested", hasStatusProperty: true });

    expect(commandQueueManager.setMessage).not.toHaveBeenCalled();
  });

  it("unlocks reentrancy even if setMessage throws", () => {
    const commandQueueManager = fakeCommandQueueManager();
    (commandQueueManager.setMessage as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error("boom");
    });
    const eventAggregator = fakeEventAggregator();
    const target = new ProgressMessageTarget(eventAggregator, commandQueueManager);

    ProgressMessageContext.commandModel = newCommandModel({ body: new TestCommand() });

    expect(() => target.write({ message: "x", hasStatusProperty: true })).toThrow("boom");
    expect(ProgressMessageContext.lockReentrancy()).toBe(true);
  });
});

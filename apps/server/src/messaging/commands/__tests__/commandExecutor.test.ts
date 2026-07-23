import { describe, expect, it, vi } from "vitest";
import { Command } from "../command.js";
import { CommandQueue } from "../commandQueue.js";
import { CommandExecutor, type CommandHandler } from "../commandExecutor.js";
import type { IManageCommandQueue } from "../commandQueueManager.js";
import { CommandExecutedEvent } from "../../events/commandExecutedEvent.js";
import type { IEventAggregator } from "../../events/iEventAggregator.js";
import { newCommandModel } from "../commandModel.js";
import { CommandStatus } from "../commandStatus.js";
import { CommandFailedException } from "../commandFailedException.js";

/** Ported from NzbDrone.Core.Test/Messaging/Commands/CommandExecutorFixture.cs, adapted for Node's async-generator-based queue consumer (see commandQueue.ts's doc comment on the blocking-wait adaptation) in place of C#'s real OS threads. */

class CommandA extends Command {}
class CommandB extends Command {
  override get completionMessage(): string | null {
    return null;
  }
}

function makeManager(commandQueue: CommandQueue): IManageCommandQueue {
  return {
    pushMany: vi.fn(),
    push: vi.fn(),
    pushByName: vi.fn(),
    queue: (signal?: AbortSignal) => commandQueue.getConsumingEnumerable(signal),
    all: vi.fn(() => []),
    get: vi.fn(),
    getStarted: vi.fn(() => []),
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

function makeEventAggregator(): IEventAggregator & { published: unknown[] } {
  const published: unknown[] = [];
  return {
    published,
    publishEvent: (event: unknown) => {
      published.push(event);
    },
  };
}

/** Waits until `predicate()` is true, polling on microtask/timer ticks -- this port's stand-in for the C# fixture's `ManualResetEventSlim.Wait(15000)`. */
async function waitFor(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("Timed out waiting for condition");
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

describe("CommandExecutor", () => {
  it("should_execute_on_executor", async () => {
    const commandQueue = new CommandQueue();
    const manager = makeManager(commandQueue);
    const eventAggregator = makeEventAggregator();
    const executor = new CommandExecutor(manager, eventAggregator);

    const executeA = vi.fn();
    executor.registerExecutor("A", { execute: executeA });

    executor.handleApplicationStarted();

    const commandA = new CommandA();
    const commandModel = newCommandModel({ body: commandA });
    commandQueue.add(commandModel);

    await waitFor(() => (manager.complete as ReturnType<typeof vi.fn>).mock.calls.length > 0);

    expect(executeA).toHaveBeenCalledWith(commandA);

    executor.handleApplicationShutdownRequested();
    await executor.waitForShutdown();
  });

  it("should_not_execute_on_incompatible_executor", async () => {
    const commandQueue = new CommandQueue();
    const manager = makeManager(commandQueue);
    const eventAggregator = makeEventAggregator();
    const executor = new CommandExecutor(manager, eventAggregator);

    const executeA = vi.fn();
    const executeB = vi.fn();
    executor.registerExecutor("A", { execute: executeA });
    executor.registerExecutor("B", { execute: executeB });

    executor.handleApplicationStarted();

    const commandA = new CommandA();
    commandQueue.add(newCommandModel({ body: commandA }));

    await waitFor(() => (manager.complete as ReturnType<typeof vi.fn>).mock.calls.length > 0);

    expect(executeA).toHaveBeenCalledTimes(1);
    expect(executeB).not.toHaveBeenCalled();

    executor.handleApplicationShutdownRequested();
    await executor.waitForShutdown();
  });

  it("broken_executor_should_publish_executed_event", async () => {
    const commandQueue = new CommandQueue();
    const manager = makeManager(commandQueue);
    const eventAggregator = makeEventAggregator();
    const onError = vi.fn();
    const executor = new CommandExecutor(manager, eventAggregator, { onError });

    const handler: CommandHandler = {
      execute: () => {
        throw new Error("Not implemented");
      },
    };
    executor.registerExecutor("A", handler);

    executor.handleApplicationStarted();
    commandQueue.add(newCommandModel({ body: new CommandA() }));

    await waitFor(() => eventAggregator.published.some((e) => e instanceof CommandExecutedEvent));

    expect(eventAggregator.published.some((e) => e instanceof CommandExecutedEvent)).toBe(true);
    expect(manager.fail).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledTimes(1);

    executor.handleApplicationShutdownRequested();
    await executor.waitForShutdown();
  });

  it("should_publish_executed_event_on_success", async () => {
    const commandQueue = new CommandQueue();
    const manager = makeManager(commandQueue);
    const eventAggregator = makeEventAggregator();
    const executor = new CommandExecutor(manager, eventAggregator);
    executor.registerExecutor("A", { execute: vi.fn() });

    executor.handleApplicationStarted();
    commandQueue.add(newCommandModel({ body: new CommandA() }));

    await waitFor(() => eventAggregator.published.some((e) => e instanceof CommandExecutedEvent));

    expect(eventAggregator.published.some((e) => e instanceof CommandExecutedEvent)).toBe(true);

    executor.handleApplicationShutdownRequested();
    await executor.waitForShutdown();
  });

  it("should_use_completion_message", async () => {
    const commandQueue = new CommandQueue();
    const manager = makeManager(commandQueue);
    const eventAggregator = makeEventAggregator();
    const executor = new CommandExecutor(manager, eventAggregator);
    executor.registerExecutor("A", { execute: vi.fn() });

    executor.handleApplicationStarted();
    const commandA = new CommandA();
    const commandModel = newCommandModel({ body: commandA });
    commandQueue.add(commandModel);

    await waitFor(() => (manager.complete as ReturnType<typeof vi.fn>).mock.calls.length > 0);

    expect(manager.complete).toHaveBeenCalledWith(commandModel, commandA.completionMessage);

    executor.handleApplicationShutdownRequested();
    await executor.waitForShutdown();
  });

  it("should_use_last_progress_message_if_completion_message_is_null", async () => {
    const commandQueue = new CommandQueue();
    const manager = makeManager(commandQueue);
    const eventAggregator = makeEventAggregator();
    const executor = new CommandExecutor(manager, eventAggregator);
    executor.registerExecutor("B", { execute: vi.fn() });

    executor.handleApplicationStarted();
    const commandB = new CommandB();
    const commandModel = newCommandModel({ body: commandB, message: "Do work" });
    commandQueue.add(commandModel);

    await waitFor(() => (manager.complete as ReturnType<typeof vi.fn>).mock.calls.length > 0);

    expect(manager.complete).toHaveBeenCalledWith(commandModel, "Do work");

    executor.handleApplicationShutdownRequested();
    await executor.waitForShutdown();
  });

  it("rethrows a CommandFailedException's own message via fail()", async () => {
    const commandQueue = new CommandQueue();
    const manager = makeManager(commandQueue);
    const eventAggregator = makeEventAggregator();
    const executor = new CommandExecutor(manager, eventAggregator, { onError: vi.fn() });

    executor.registerExecutor("A", {
      execute: () => {
        throw new CommandFailedException("custom failure reason");
      },
    });

    executor.handleApplicationStarted();
    commandQueue.add(newCommandModel({ body: new CommandA() }));

    await waitFor(() => (manager.fail as ReturnType<typeof vi.fn>).mock.calls.length > 0);

    expect(manager.fail).toHaveBeenCalledWith(
      expect.anything(),
      "custom failure reason",
      expect.any(CommandFailedException)
    );

    executor.handleApplicationShutdownRequested();
    await executor.waitForShutdown();
  });

  it("marks the command Started before invoking the handler", async () => {
    const commandQueue = new CommandQueue();
    const manager = makeManager(commandQueue);
    const eventAggregator = makeEventAggregator();
    const executor = new CommandExecutor(manager, eventAggregator);

    const commandModel = newCommandModel({ body: new CommandA() });
    let modelStatusDuringExecute: CommandStatus | undefined;
    executor.registerExecutor("A", {
      execute: () => {
        modelStatusDuringExecute = commandModel.status;
      },
    });

    executor.handleApplicationStarted();
    commandQueue.add(commandModel);

    await waitFor(() => (manager.start as ReturnType<typeof vi.fn>).mock.calls.length > 0);
    expect(manager.start).toHaveBeenCalledWith(commandModel);
    await waitFor(() => modelStatusDuringExecute !== undefined);
    // CommandQueue.tryGetInternal() sets Status = Started synchronously
    // before the command is ever handed to a handler -- see commandQueue.ts.
    expect(modelStatusDuringExecute).toBe(CommandStatus.Started);

    executor.handleApplicationShutdownRequested();
    await executor.waitForShutdown();
  });

  it("runs up to `concurrency` commands concurrently", async () => {
    const commandQueue = new CommandQueue();
    const manager = makeManager(commandQueue);
    const eventAggregator = makeEventAggregator();
    const executor = new CommandExecutor(manager, eventAggregator, { concurrency: 2 });

    let inFlight = 0;
    let maxInFlight = 0;
    let releaseAll: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      releaseAll = resolve;
    });

    executor.registerExecutor("A", {
      execute: async () => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await gate;
        inFlight -= 1;
      },
    });

    executor.handleApplicationStarted();
    commandQueue.add(newCommandModel({ body: new CommandA() }));
    commandQueue.add(newCommandModel({ body: new CommandA() }));

    await waitFor(() => maxInFlight === 2);
    releaseAll();

    await waitFor(() => (manager.complete as ReturnType<typeof vi.fn>).mock.calls.length >= 2);

    expect(maxInFlight).toBe(2);

    executor.handleApplicationShutdownRequested();
    await executor.waitForShutdown();
  });
});

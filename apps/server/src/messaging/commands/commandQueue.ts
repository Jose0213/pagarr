import type { CommandModel } from "./commandModel.js";
import { CommandStatus } from "./commandStatus.js";

/**
 * Ported from NzbDrone.Core/Messaging/Commands/CommandQueue.cs.
 *
 * ## Concurrency model deviation
 *
 * C#'s `CommandQueue` is a thread-safe blocking collection: `lock
 * (_mutex)` around every mutation/read, and `GetConsumingEnumerable`
 * blocks the calling OS thread on `Monitor.Wait(_mutex)` when nothing is
 * currently eligible to run, woken by `Monitor.PulseAll(_mutex)` whenever
 * something is added, completed, or cancelled (or the cancellation token
 * fires). `CommandExecutor` runs `THREAD_LIMIT = 3` of these consumer
 * loops on real OS threads in parallel.
 *
 * Node has one JS thread -- there's no OS-level blocking wait to port, and
 * no risk of two callers racing `_items` concurrently the way two .NET
 * threads could without the lock (every method here runs to completion
 * before any other JS on this queue can run, since none of `CommandQueue`'s
 * own methods `await` mid-mutation). So the `lock (_mutex)` sections
 * become plain synchronous code -- no explicit lock needed for
 * correctness under Node's single-threaded execution model, which is the
 * exact problem C#'s lock existed to solve.
 *
 * What Node's model *doesn't* give for free is the "block until something
 * becomes available" behavior `Monitor.Wait`/`PulseAll` provided --
 * without OS thread parking, `getConsumingEnumerable` here is ported as an
 * async generator that `await`s a promise resolved by `pulseAllConsumers`
 * (or the passed-in `AbortSignal` firing), which is the direct Node
 * equivalent of "park this consumer until pulsed" without busy-waiting or
 * blocking the event loop. `CommandExecutor` then runs N of these
 * concurrent `for await` loops (still N-way concurrent "workers", just
 * cooperatively scheduled instead of OS-thread-parallel -- see
 * `commandExecutor.ts`'s doc comment for the full THREAD_LIMIT discussion).
 *
 * `IEnumerable`/`GetEnumerator()` (C#'s synchronous "snapshot the current
 * items and iterate them" support, used by `foreach (var command in
 * commandQueue)` call sites elsewhere in Readarr) has no direct port here
 * since nothing in this worktree's scope actually iterates a `CommandQueue`
 * with a bare `foreach` -- `all()` below covers the same "get a
 * point-in-time snapshot" need explicitly.
 */
export class CommandQueue {
  private readonly items: CommandModel[] = [];
  private waiters: (() => void)[] = [];

  get count(): number {
    return this.items.length;
  }

  add(item: CommandModel): void {
    this.items.push(item);
    this.pulseAllConsumers();
  }

  /** Ported from `GetEnumerator()`/`All()`: a point-in-time snapshot copy, not a live view. */
  all(): CommandModel[] {
    return [...this.items];
  }

  find(id: number): CommandModel | undefined {
    return this.all().find((q) => q.id === id);
  }

  removeMany(commands: Iterable<CommandModel>): void {
    for (const command of commands) {
      const index = this.items.indexOf(command);
      if (index !== -1) {
        this.items.splice(index, 1);
      }
    }
    this.pulseAllConsumers();
  }

  removeIfQueued(id: number): boolean {
    const command = this.items.find((q) => q.id === id);

    if (command?.status === CommandStatus.Queued) {
      const index = this.items.indexOf(command);
      this.items.splice(index, 1);
      this.pulseAllConsumers();
      return true;
    }

    return false;
  }

  queuedOrStarted(): CommandModel[] {
    return this.all().filter(
      (q) => q.status === CommandStatus.Queued || q.status === CommandStatus.Started
    );
  }

  /**
   * Ported from `GetConsumingEnumerable(CancellationToken)`. `signal`
   * replaces the C# `CancellationToken` -- ported as Node's standard
   * `AbortSignal` (the direct equivalent used throughout this port's async
   * code elsewhere). See module doc comment for the blocking-wait ->
   * async-generator adaptation.
   */
  async *getConsumingEnumerable(signal?: AbortSignal): AsyncGenerator<CommandModel> {
    const onAbort = (): void => this.pulseAllConsumers();
    signal?.addEventListener("abort", onAbort);

    try {
      while (!signal?.aborted) {
        const command = this.tryGetInternal();

        if (command !== undefined) {
          yield command;
          continue;
        }

        if (signal?.aborted) {
          break;
        }

        await this.waitForPulse();
      }
    } finally {
      signal?.removeEventListener("abort", onAbort);
    }
  }

  /** Ported from `PulseAllConsumers()`: wakes every consumer parked in `getConsumingEnumerable` so it re-evaluates (new item added, a running command completed freeing up an exclusivity slot, or cancellation requested). */
  pulseAllConsumers(): void {
    const toWake = this.waiters;
    this.waiters = [];
    for (const resolve of toWake) {
      resolve();
    }
  }

  private waitForPulse(): Promise<void> {
    return new Promise<void>((resolve) => {
      this.waiters.push(resolve);
    });
  }

  /**
   * Ported from `TryGet(out CommandModel item)`. Exposed as a
   * boolean-returning pair (`command !== undefined` in place of C#'s `out
   * bool`/`out CommandModel`) since TS has no `out` parameters -- callers
   * check `!== undefined` the same way C# callers check the bool return.
   */
  tryGet(): CommandModel | undefined {
    return this.tryGetInternal();
  }

  private tryGetInternal(): CommandModel | undefined {
    if (this.items.length === 0) {
      return undefined;
    }

    const startedCommands = this.items.filter((c) => c.status === CommandStatus.Started);

    const exclusiveTypes = startedCommands
      .filter((x) => x.body.isTypeExclusive)
      .map((x) => x.body.name);

    let queuedCommands = this.items.filter((c) => c.status === CommandStatus.Queued);

    if (startedCommands.some((x) => x.body.requiresDiskAccess)) {
      queuedCommands = queuedCommands.filter((c) => !c.body.requiresDiskAccess);
    }

    if (startedCommands.some((x) => x.body.isTypeExclusive)) {
      queuedCommands = queuedCommands.filter((c) => !exclusiveTypes.includes(c.body.name));
    }

    if (startedCommands.some((x) => x.body.isLongRunning)) {
      queuedCommands = queuedCommands.filter(
        (c) => c.status === CommandStatus.Queued && !c.body.isExclusive
      );
    }

    const localItem = orderByPriorityThenQueuedAt(queuedCommands)[0];

    // Nothing queued that meets the requirements
    if (localItem === undefined) {
      return undefined;
    }

    // If any executing command is exclusive don't want return another command until it completes.
    if (startedCommands.some((c) => c.body.isExclusive)) {
      return undefined;
    }

    // If the next command to execute is exclusive wait for executing commands to complete.
    // This will prevent other tasks from starting so the exclusive task executes in the order it should.
    if (localItem.body.isExclusive && startedCommands.length > 0) {
      return undefined;
    }

    // A command ready to execute
    localItem.startedAt = new Date().toISOString();
    localItem.status = CommandStatus.Started;

    return localItem;
  }
}

/** Ported from `queuedCommands.OrderByDescending(c => c.Priority).ThenBy(c => c.QueuedAt).FirstOrDefault()`. */
function orderByPriorityThenQueuedAt(commands: CommandModel[]): CommandModel[] {
  return [...commands].sort((a, b) => {
    if (a.priority !== b.priority) {
      return b.priority - a.priority;
    }
    return a.queuedAt < b.queuedAt ? -1 : a.queuedAt > b.queuedAt ? 1 : 0;
  });
}

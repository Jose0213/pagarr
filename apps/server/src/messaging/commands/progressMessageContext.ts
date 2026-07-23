import type { CommandModel } from "./commandModel.js";

/**
 * Forward-ref/local stand-in for NzbDrone.Core/ProgressMessaging/
 * ProgressMessageContext.cs -- `ProgressMessaging` is its own not-yet-ported
 * module (not part of this worktree's scope: Commands/, Events/, the
 * top-level Messaging/ files, and Queue/ only -- see task instructions),
 * but `CommandExecutor.cs` and `CommandResultReporter.cs` both depend on
 * it, so porting those two faithfully requires *something* here.
 *
 * C#'s original is thread-local static state (`[ThreadStatic]` plus an
 * `AsyncLocal<CommandModel>` fallback for async-context flow) tracking
 * "which CommandModel is the currently-executing command on this
 * thread/async-flow", read by log/progress-message plumbing elsewhere in
 * Readarr to attribute a message to the command that produced it, plus a
 * simple non-reentrant lock (`LockReentrancy`/`UnlockReentrancy`) guarding
 * `CommandResultReporter.Report` against recursive reporting.
 *
 * Node has no per-OS-thread execution model to mirror `[ThreadStatic]`
 * against (`CommandExecutor`'s `THREAD_LIMIT = 3` OS threads become,
 * faithfully, 3 concurrent async worker loops here -- see
 * `commandExecutor.ts`'s doc comment) and no `AsyncLocal` equivalent
 * wired up elsewhere in this port. This is ported as plain module-level
 * mutable state instead: correct for the actual concurrency this port
 * uses (`Promise`-based cooperative concurrency, not true parallelism --
 * only one command's synchronous JS ever actually executes at an instant
 * even with N worker loops racing each other), and behaviorally
 * equivalent to the C# original in the cases this module's own commands
 * exercise. A real `AsyncLocal`-equivalent (Node's `AsyncLocalStorage`)
 * could replace this with zero call-site changes if a future module needs
 * stricter per-async-chain isolation than this simple module-level
 * variable provides.
 */
let currentCommandModel: CommandModel | null = null;
let reentrancyLock = false;

export const ProgressMessageContext = {
  get commandModel(): CommandModel | null {
    return currentCommandModel;
  },
  set commandModel(value: CommandModel | null) {
    currentCommandModel = value;
  },
  lockReentrancy(): boolean {
    if (reentrancyLock) {
      return false;
    }
    reentrancyLock = true;
    return true;
  },
  unlockReentrancy(): void {
    reentrancyLock = false;
  },
};

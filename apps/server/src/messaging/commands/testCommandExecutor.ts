import type { IExecute } from "./iExecute.js";
import type { TestCommand } from "./testCommand.js";

/**
 * Ported from NzbDrone.Core/Messaging/Commands/TestCommandExecutor.cs.
 *
 * No NLog `Logger` -- `_logger.ProgressInfo(...)` calls become an optional
 * `onProgress` callback, matching this port's established no-NLog-yet
 * convention (see config/configService.ts's doc comment on `onConfigSaved`).
 * `Thread.Sleep(message.Duration)` becomes an actual async `setTimeout`
 * delay, since blocking the single Node event loop for up to several
 * seconds would stall every other in-flight command/request -- `execute`
 * is `async` here where the C# original is a synchronous, thread-blocking
 * call (this command exists purely as a manual "does the queue work"
 * smoke test, so an async delay is behaviorally equivalent for that
 * purpose).
 */
export class TestCommandExecutor implements IExecute<TestCommand> {
  constructor(private readonly onProgress?: (message: string) => void) {}

  async execute(message: TestCommand): Promise<void> {
    this.onProgress?.(`Starting Test command. duration ${message.duration}`);
    await new Promise<void>((resolve) => setTimeout(resolve, message.duration));
    this.onProgress?.("Completed Test command");
  }
}

/**
 * Ported from NzbDrone.Common/TPL/Debouncer.cs.
 *
 * C# uses a `System.Timers.Timer` plus a `lock`/volatile-flag pause/resume
 * mechanism (Pause/Resume aren't used by RootFolderWatchingService, the only
 * consumer in this module, but are ported for shape fidelity). Node has no
 * built-in debounce-with-pause primitive; this ports the exact same
 * state machine (triggered flag, paused counter, executeRestartsTimer
 * option) on top of `setTimeout`/`clearTimeout` instead of a `Timer` object
 * -- single-threaded JS has no `lock` equivalent to port (no concurrent
 * timer-callback-vs-Execute() race is possible the way it is in C#).
 */
export class Debouncer {
  private timer: NodeJS.Timeout | null = null;
  private paused = 0;
  private triggered = false;

  constructor(
    private readonly action: () => void,
    private readonly debounceDurationMs: number,
    private readonly executeRestartsTimer = false
  ) {}

  private start(): void {
    this.stop();
    this.timer = setTimeout(() => {
      this.timer = null;
      if (this.paused === 0) {
        this.triggered = false;
        this.action();
      }
    }, this.debounceDurationMs);
  }

  private stop(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  execute(): void {
    this.triggered = true;

    if (this.executeRestartsTimer) {
      this.stop();
    }

    if (this.paused === 0) {
      this.start();
    }
  }

  pause(): void {
    this.paused++;
    this.stop();
  }

  resume(): void {
    this.paused--;
    if (this.paused === 0 && this.triggered) {
      this.start();
    }
  }
}

/**
 * Ported from NzbDrone.Common/TPL/Debouncer.cs (`NzbDrone.Common`, a
 * cross-cutting utility, not owned by any Phase module -- ported here since
 * `DownloadMonitoringService` (this module's real C# source) is Debouncer's
 * only consumer among modules ported so far).
 *
 * Node's single-threaded event loop has no equivalent of C#'s `lock
 * (_timer)` critical sections -- `setTimeout`/`clearTimeout` calls here are
 * synchronous with respect to any other code running on the same tick, so
 * the `_paused`/`_triggered` state machine below reproduces the same
 * observable behavior without needing a lock.
 */
export class Debouncer {
  private paused = 0;
  private triggered = false;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly action: () => void,
    private readonly debounceDurationMs: number,
    private readonly executeRestartsTimer = false
  ) {}

  private startTimer(): void {
    this.stopTimer();
    this.timer = setTimeout(() => {
      if (this.paused === 0) {
        this.triggered = false;
        this.stopTimer();
        this.action();
      }
    }, this.debounceDurationMs);
  }

  private stopTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  execute(): void {
    this.triggered = true;
    if (this.executeRestartsTimer) {
      this.stopTimer();
    }

    if (this.paused === 0) {
      this.startTimer();
    }
  }

  pause(): void {
    this.paused++;
    this.stopTimer();
  }

  resume(): void {
    this.paused--;
    if (this.paused === 0 && this.triggered) {
      this.startTimer();
    }
  }
}

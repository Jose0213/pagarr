import type { IEvent } from "../messaging/index.js";

/**
 * Ported from NzbDrone.Core/Lifecycle/ApplicationShutdownRequested.cs.
 *
 * C#: `public bool Restarting { get; }` set via a constructor parameter
 * defaulting to `false`. Published by `LifecycleService.Shutdown()`/
 * `Restart()` (this module's own `lifecycleService.ts`) to let any
 * `IHandle<ApplicationShutdownRequested>` subscriber (e.g. a future
 * database-connection-close handler, or the scheduler's `Handle(
 * ApplicationShutdownRequested)` -- see `jobs/Scheduler.ts`'s doc comment,
 * which already documents its `stop()` method as the future subscription
 * target once this event existed) know whether the shutdown is a full stop
 * or a restart-in-progress.
 */
export class ApplicationShutdownRequested implements IEvent {
  readonly restarting: boolean;

  constructor(restarting = false) {
    this.restarting = restarting;
  }
}

import {
  CommandTrigger,
  type IEvent,
  type IEventAggregator,
  type IExecute,
  type IHandleAsync,
} from "../messaging/index.js";
import type { EventCtor } from "../messaging/events/eventAggregator.js";
import type { CheckHealthCommand } from "./checkHealthCommand.js";
import type { CheckOnEntry } from "./checkOnAttribute.js";
import { EventDrivenHealthCheck } from "./eventDrivenHealthCheck.js";
import { healthCheckSourceName, HealthCheckResult, type HealthCheck } from "./healthCheck.js";
import { HealthCheckCompleteEvent } from "./healthCheckCompleteEvent.js";
import { HealthCheckFailedEvent } from "./healthCheckFailedEvent.js";
import {
  isProvideHealthCheckWithMessage,
  type IProvideHealthCheck,
} from "./iProvideHealthCheck.js";
import type { IServerSideNotificationService } from "./serverSideNotificationService.js";

/**
 * Ported from NzbDrone.Core/HealthCheck/HealthCheckService.cs.
 *
 * ## The `[CheckOn]` reflection problem and how this port adapts it
 *
 * C#'s `GetEventDrivenHealthChecks()` reflects over every registered
 * `IProvideHealthCheck`'s `[CheckOn]` class attributes
 * (`healthCheck.GetType().GetAttributes<CheckOnAttribute>()`) to build a
 * `Dictionary<Type, IEventDrivenHealthCheck[]>` keyed by event type. Per
 * this port's explicit-over-reflection convention (see
 * `checkOnAttribute.ts`'s doc comment), the caller supplies that same
 * association explicitly: the constructor takes an array of
 * `HealthCheckRegistration` (`{ check, checkOn }`) pairs -- each concrete
 * check module exports its own `CHECK_ON` array alongside the class (see
 * e.g. `checks/apiKeyValidationCheck.ts`) for a caller to zip together --
 * and this class builds the identical `Map<EventCtor<IEvent>,
 * EventDrivenHealthCheck<IEvent>[]>` the C# reflection scan would have
 * produced.
 *
 * ## Wiring into the real EventAggregator/IHandle/IExecute
 *
 * Messaging (`../messaging/`) landed in the immediately-prior phase with a
 * REAL `EventAggregator`/`IHandle`/`IHandleAsync`/`IExecute` -- unlike
 * several earlier-phase modules that had to stub these out (see
 * `db/events.ts`'s `NullEventAggregator`, `books/events.ts`'s
 * `NullBooksEventAggregator`), this class uses the genuine thing directly:
 * it implements `IExecute<CheckHealthCommand>` (registered via a caller's
 * `commandQueueManager`/dispatcher -- Messaging.Commands' executor wiring is
 * outside this module's scope, same as every other `IExecute<T>`
 * implementor in this codebase so far) and `IHandleAsync<IEvent>` (the
 * "global" handler kind `EventAggregator.subscribeGlobal()` exists
 * specifically for -- see that method's doc comment: "handlers that see
 * every published event", exactly `HandleAsync(IEvent message)`'s C# role).
 * A caller wires this service up with:
 * ```
 * eventAggregator.subscribeGlobal(healthCheckService);
 * eventAggregator.subscribe(ApplicationStartedEvent, { handle: () =>
 * healthCheckService.handleApplicationStarted() });
 * ```
 * (the second line stands in for `IHandleAsync<ApplicationStartedEvent>`,
 * since Lifecycle's `ApplicationStartedEvent` itself is not part of this
 * module's scope -- see `handleApplicationStarted()`'s own doc comment).
 *
 * `ICacheManager.GetCache<HealthCheck>(GetType())` (a get/set/find/remove/
 * values cache keyed by `result.Source.Name`) is ported as a plain
 * `Map<string, HealthCheck>` -- matching this repo's established
 * "ICacheManager -> plain Map" convention (see `jobs/TaskManager.ts`'s doc
 * comment).
 *
 * `IRuntimeInfo.StartTime` (used to compute `_startupGracePeriodEndTime =
 * StartTime + 15min`) has no ported equivalent (`NzbDrone.Common.
 * EnvironmentInfo` isn't in scope here either -- same situation
 * `serverSideNotificationService.ts`'s doc comment documents for
 * `BuildInfo`/`OsInfo`). Narrowed to a plain `startTimeMs` constructor
 * value (defaulting to `Date.now()` at construction, i.e. "now" the same
 * way a real `IRuntimeInfo.StartTime` would read at process start) plus an
 * injectable clock so tests can control elapsed time without real timers --
 * same `Clock` seam shape `IndexerStatusService`/`ProviderStatusServiceBase`
 * already established for their own startup-grace-period logic.
 */

/** Minimal logger surface HealthCheckService needs. */
export interface HealthCheckServiceLogger {
  trace(message: string, ...args: unknown[]): void;
}

const noopLogger: HealthCheckServiceLogger = { trace: () => {} };

/** Clock seam -- see module doc comment re: IRuntimeInfo.StartTime. */
export interface HealthCheckServiceClock {
  now(): number;
}

const realClock: HealthCheckServiceClock = { now: () => Date.now() };

const STARTUP_GRACE_PERIOD_MS = 15 * 60 * 1000;

/** One `{ check, checkOn }` registration entry -- the explicit substitute for a `[CheckOn]`-decorated class. See module doc comment. */
export interface HealthCheckRegistration {
  check: IProvideHealthCheck;
  checkOn?: CheckOnEntry[];
}

export interface IHealthCheckService {
  results(): HealthCheck[];
}

export class HealthCheckService
  implements IHealthCheckService, IExecute<CheckHealthCommand>, IHandleAsync<IEvent>
{
  private readonly startupGracePeriodEndTimeMs: number;
  private readonly healthChecks: IProvideHealthCheck[];
  private readonly startupHealthChecks: IProvideHealthCheck[];
  private readonly scheduledHealthChecks: IProvideHealthCheck[];
  private readonly eventDrivenHealthChecks: Map<
    EventCtor<IEvent>,
    EventDrivenHealthCheck<IEvent>[]
  >;

  private readonly healthCheckResults = new Map<string, HealthCheck>();

  private hasRunHealthChecksAfterGracePeriod = false;
  private isRunningHealthChecksAfterGracePeriod = false;

  constructor(
    registrations: HealthCheckRegistration[],
    private readonly serverSideNotificationService: IServerSideNotificationService,
    private readonly eventAggregator: IEventAggregator,
    private readonly clock: HealthCheckServiceClock = realClock,
    startTimeMs: number = realClock.now(),
    private readonly logger: HealthCheckServiceLogger = noopLogger
  ) {
    this.healthChecks = registrations.map((r) => r.check);

    this.startupHealthChecks = this.healthChecks.filter((v) => v.checkOnStartup);
    this.scheduledHealthChecks = this.healthChecks.filter((v) => v.checkOnSchedule);
    this.eventDrivenHealthChecks = this.buildEventDrivenHealthChecks(registrations);
    this.startupGracePeriodEndTimeMs = startTimeMs + STARTUP_GRACE_PERIOD_MS;
  }

  results(): HealthCheck[] {
    return [...this.healthCheckResults.values()];
  }

  /** Ported from HealthCheckService.GetEventDrivenHealthChecks() -- see module doc comment for the reflection->explicit-registry adaptation. */
  private buildEventDrivenHealthChecks(
    registrations: HealthCheckRegistration[]
  ): Map<EventCtor<IEvent>, EventDrivenHealthCheck<IEvent>[]> {
    const map = new Map<EventCtor<IEvent>, EventDrivenHealthCheck<IEvent>[]>();

    for (const registration of registrations) {
      for (const entry of registration.checkOn ?? []) {
        const eventDriven = new EventDrivenHealthCheck<IEvent>(
          registration.check,
          entry.condition,
          entry.eventType
        );
        const list = map.get(entry.eventType);
        if (list) {
          list.push(eventDriven);
        } else {
          map.set(entry.eventType, [eventDriven]);
        }
      }
    }

    return map;
  }

  /** Ported from HealthCheckService.PerformHealthCheck(IProvideHealthCheck[], IEvent, bool). */
  private async performHealthCheck(
    healthChecks: IProvideHealthCheck[],
    message: IEvent | null = null,
    performServerChecks = false
  ): Promise<void> {
    const results: HealthCheck[] = [];

    for (const healthCheck of healthChecks) {
      if (isProvideHealthCheckWithMessage(healthCheck) && message !== null) {
        results.push(await healthCheck.checkWithMessage(message));
      } else {
        results.push(await healthCheck.check());
      }
    }

    if (performServerChecks) {
      results.push(...(await this.serverSideNotificationService.getServerChecks()));
    }

    for (const result of results) {
      const key = healthCheckSourceName(result.source);

      if (result.type === HealthCheckResult.Ok) {
        this.healthCheckResults.delete(key);
      } else {
        if (!this.healthCheckResults.has(key)) {
          this.eventAggregator.publishEvent(
            new HealthCheckFailedEvent(result, !this.hasRunHealthChecksAfterGracePeriod)
          );
        }

        this.healthCheckResults.set(key, result);
      }
    }

    this.eventAggregator.publishEvent(new HealthCheckCompleteEvent());
  }

  /** Ported from HealthCheckService.Execute(CheckHealthCommand message). */
  async execute(message: CheckHealthCommand): Promise<void> {
    if (message.trigger === CommandTrigger.Manual) {
      await this.performHealthCheck(this.healthChecks, null, true);
    } else {
      await this.performHealthCheck(this.scheduledHealthChecks, null, true);
    }
  }

  /**
   * Ported from HealthCheckService.HandleAsync(ApplicationStartedEvent
   * message). FORWARD-REFERENCE: `ApplicationStartedEvent` itself is
   * `NzbDrone.Core.Lifecycle`, not part of this module's scope (same
   * "Lifecycle not ported" situation `config/configFileProvider.ts`'s
   * `handleApplicationStarted()` already documents) -- exposed as a plain
   * method a caller invokes directly instead of a typed `IHandleAsync<
   * ApplicationStartedEvent>` subscription, matching that established
   * precedent exactly (including the method name).
   */
  async handleApplicationStarted(): Promise<void> {
    await this.performHealthCheck(this.startupHealthChecks, null, true);
  }

  /**
   * Ported from HealthCheckService.HandleAsync(IEvent message) -- the
   * "global" handler (`IHandleAsync<IEvent>`, subscribed via
   * `eventAggregator.subscribeGlobal(this)`; see module doc comment) that
   * re-runs startup checks once after the 15-minute startup grace period
   * has elapsed, then dispatches to whichever event-driven checks are
   * subscribed to `message`'s concrete event type.
   */
  async handleAsync(message: IEvent): Promise<void> {
    if (message instanceof HealthCheckCompleteEvent) {
      return;
    }

    // If we haven't previously re-run health checks after startup grace period run startup checks again and track so they aren't run again.
    // Return early after re-running checks to avoid triggering checks multiple times.
    if (
      !this.hasRunHealthChecksAfterGracePeriod &&
      !this.isRunningHealthChecksAfterGracePeriod &&
      this.clock.now() > this.startupGracePeriodEndTimeMs
    ) {
      this.isRunningHealthChecksAfterGracePeriod = true;

      await this.performHealthCheck(this.startupHealthChecks);

      // Update after running health checks so new failure notifications aren't sent 2x.
      this.hasRunHealthChecksAfterGracePeriod = true;

      // Explicitly notify for any failed checks since existing failed results would not have sent events.
      for (const result of this.healthCheckResults.values()) {
        this.eventAggregator.publishEvent(new HealthCheckFailedEvent(result, false));
      }

      this.isRunningHealthChecksAfterGracePeriod = false;
    }

    const checks = this.eventDrivenHealthChecks.get(message.constructor as EventCtor<IEvent>);

    if (!checks) {
      return;
    }

    const filteredChecks: IProvideHealthCheck[] = [];

    for (const eventDrivenHealthCheck of checks) {
      const previouslyFailed = [...this.healthCheckResults.values()].some(
        (r) => r.source === eventDrivenHealthCheck.healthCheck.constructor
      );

      if (eventDrivenHealthCheck.shouldExecute(message, previouslyFailed)) {
        filteredChecks.push(eventDrivenHealthCheck.healthCheck);
      }
    }

    // TODO: Add debounce
    await this.performHealthCheck(filteredChecks, message);
  }
}

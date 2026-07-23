import type { IEvent } from "../messaging/index.js";
import type { EventCtor } from "../messaging/events/eventAggregator.js";
import { CheckOnCondition } from "./checkOnAttribute.js";
import { isCheckOnCondition, type ICheckOnCondition } from "./iCheckOnCondition.js";
import type { IProvideHealthCheck } from "./iProvideHealthCheck.js";

/**
 * Ported from NzbDrone.Core/HealthCheck/EventDrivenHealthCheck.cs.
 *
 * C#'s `EventDrivenHealthCheck<TEvent>` bundles one `IProvideHealthCheck`
 * with one `[CheckOn]` attribute's condition, plus a soft-cast `EventFilter
 * = healthCheck as ICheckOnCondition<TEvent>`. Ported as a plain class with
 * the same three fields/behavior; `eventType` (the concrete `[CheckOn]`
 * entry's event constructor) is now required at construction so
 * `isCheckOnCondition` can correctly emulate C#'s reified-generic identity
 * check instead of a same-method-name-for-any-event duck type -- see
 * `iCheckOnCondition.ts`'s doc comment for the full rationale (this is what
 * `__tests__/healthCheckService.test.ts`'s translated
 * `should_execute_unconditional` case exercises).
 */
export class EventDrivenHealthCheck<TEvent extends IEvent> {
  readonly healthCheck: IProvideHealthCheck;
  readonly condition: CheckOnCondition;
  readonly eventFilter: ICheckOnCondition<TEvent> | null;

  constructor(
    healthCheck: IProvideHealthCheck,
    condition: CheckOnCondition,
    eventType: EventCtor<TEvent>
  ) {
    this.healthCheck = healthCheck;
    this.condition = condition;
    this.eventFilter = isCheckOnCondition<TEvent>(healthCheck, eventType) ? healthCheck : null;
  }

  /** Ported from EventDrivenHealthCheck.ShouldExecute(IEvent message, bool previouslyFailed). */
  shouldExecute(message: TEvent, previouslyFailed: boolean): boolean {
    if (this.condition === CheckOnCondition.SuccessfulOnly && previouslyFailed) {
      return false;
    }

    if (this.condition === CheckOnCondition.FailedOnly && !previouslyFailed) {
      return false;
    }

    if (this.eventFilter !== null && !this.eventFilter.shouldCheckOnEvent(message)) {
      return false;
    }

    return true;
  }
}

import type { IEvent } from "../messaging/index.js";
import type { EventCtor } from "../messaging/events/eventAggregator.js";

/**
 * Ported from NzbDrone.Core/HealthCheck/CheckOnAttribute.cs.
 *
 * C# decorates each health-check class with one or more
 * `[CheckOn(typeof(SomeEvent), CheckOnCondition.X)]` class attributes,
 * discovered via reflection in `HealthCheckService.GetEventDrivenHealthChecks`
 * (`healthCheck.GetType().GetAttributes<CheckOnAttribute>()`). Per this
 * port's established explicit-over-reflection convention -- the exact
 * precedent `messaging/eventHandleOrder.ts`'s doc comment sets for
 * `EventHandleOrderAttribute` ("a handler's order is declared as plain
 * optional data supplied at registration time instead of a decorator read
 * via reflection") -- each concrete check module exports a plain array of
 * `CheckOnEntry` objects (its own `CHECK_ON` constant) alongside the class,
 * and `HealthCheckService`'s caller passes `{ check, checkOn }` pairs into
 * `registerHealthChecks()` instead of a reflection scan discovering the
 * attributes. See `healthCheckService.ts`'s doc comment for how that
 * registry is consumed.
 */
export enum CheckOnCondition {
  Always = "Always",
  FailedOnly = "FailedOnly",
  SuccessfulOnly = "SuccessfulOnly",
}

export interface CheckOnEntry<TEvent extends IEvent = IEvent> {
  eventType: EventCtor<TEvent>;
  condition: CheckOnCondition;
}

/** Convenience constructor for a `CheckOnEntry`, mirroring `new CheckOnAttribute(typeof(X), condition)`'s two-arg shape (`condition` defaults to `Always`, same as the C# ctor's `CheckOnCondition condition = CheckOnCondition.Always`). */
export function checkOn<TEvent extends IEvent>(
  eventType: EventCtor<TEvent>,
  condition: CheckOnCondition = CheckOnCondition.Always
): CheckOnEntry<TEvent> {
  return { eventType, condition };
}

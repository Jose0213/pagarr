import type { IEvent } from "../messaging/index.js";
import type { EventCtor } from "../messaging/events/eventAggregator.js";

/**
 * Ported from NzbDrone.Core/HealthCheck/ICheckOnCondition.cs.
 *
 * A health check class that wants finer-grained control over whether a
 * particular event instance should trigger a re-check (beyond the blanket
 * Always/FailedOnly/SuccessfulOnly `CheckOnCondition` -- see
 * `checkOnAttribute.ts`) implements this for the specific event type it
 * cares about. C#'s `EventDrivenHealthCheck<TEvent>` does `healthCheck as
 * ICheckOnCondition<TEvent>` -- a soft cast on a REIFIED generic interface:
 * `ICheckOnCondition<FakeEvent>` and `ICheckOnCondition<FakeEvent2>` are
 * distinct .NET interfaces, so a class implementing only
 * `ICheckOnCondition<FakeEvent>` fails the cast (`null`) for `TEvent =
 * FakeEvent2`, even though both share the same method name
 * `ShouldCheckOnEvent` at the IL level.
 *
 * TS has no reified generics -- a plain `typeof x.shouldCheckOnEvent ===
 * "function"` duck-type check cannot distinguish "implements
 * ICheckOnCondition<FakeEvent>" from "implements
 * ICheckOnCondition<FakeEvent2>"; both look identical at runtime (same
 * gap `messaging/events/eventAggregator.ts`'s "Event identity" doc comment
 * flags for `ModelEvent<T>`, but here it's directly observable via
 * `HealthCheckServiceFixture`'s `should_execute_unconditional` test, which
 * this framework's own translated test suite catches -- see
 * `__tests__/healthCheckService.test.ts`). Fixed by having
 * `ICheckOnCondition<TEvent>` implementors declare WHICH event
 * constructor(s) they filter for via `checkOnConditionFor` (an explicit
 * registry entry, same "explicit over reflection" substitute this whole
 * module already uses for `[CheckOn]` itself) -- `isCheckOnCondition` then
 * checks BOTH "has a shouldCheckOnEvent method" AND "was registered for
 * this exact event constructor" before treating the check as filtering.
 */
export interface ICheckOnCondition<TEvent extends IEvent> {
  shouldCheckOnEvent(message: TEvent): boolean;
}

const checkOnConditionEventTypes = new WeakMap<object, Set<EventCtor<IEvent>>>();

/**
 * Registers that `check` implements `ICheckOnCondition<TEvent>` for the
 * given `eventType` specifically -- the explicit substitute for C#'s
 * reified `ICheckOnCondition<TEvent>` generic identity. Call this once per
 * event type a check's `shouldCheckOnEvent` is actually meant to filter
 * (typically right after constructing the check, alongside building its
 * `CHECK_ON` array).
 */
export function checkOnConditionFor<TEvent extends IEvent>(
  check: ICheckOnCondition<TEvent>,
  eventType: EventCtor<TEvent>
): void {
  const set = checkOnConditionEventTypes.get(check) ?? new Set<EventCtor<IEvent>>();
  set.add(eventType);
  checkOnConditionEventTypes.set(check, set);
}

/**
 * Ported from `healthCheck as ICheckOnCondition<TEvent>` in
 * EventDrivenHealthCheck's constructor -- see this module's doc comment for
 * why `eventType` must be supplied explicitly rather than inferred from
 * `TEvent` alone.
 */
export function isCheckOnCondition<TEvent extends IEvent>(
  check: object,
  eventType: EventCtor<TEvent>
): check is ICheckOnCondition<TEvent> {
  if (typeof (check as Partial<ICheckOnCondition<TEvent>>).shouldCheckOnEvent !== "function") {
    return false;
  }

  const registeredFor = checkOnConditionEventTypes.get(check);
  return registeredFor !== undefined && registeredFor.has(eventType);
}

/**
 * Ported from NzbDrone.Core/Messaging/EventHandleOrderAttribute.cs.
 *
 * C# used a `[EventHandleOrder(EventHandleOrder.First)]` method attribute,
 * read via reflection in `EventAggregator.GetEventHandleOrder` to sort
 * `IHandle<TEvent>` implementations before invoking them (First < Any <
 * Last, with "Any" -- the enum's default/unmarked value -- as the fallback
 * for handlers with no attribute). Per this port's explicit-over-reflection
 * convention (see `eventAggregator.ts`'s doc comment), a handler's order is
 * declared as plain optional data supplied at registration time instead of
 * a decorator read via reflection: `EventAggregator.subscribe` takes an
 * optional `order` argument, defaulting to `EventHandleOrder.Any` exactly
 * like the C# attribute-less default.
 */
export enum EventHandleOrder {
  First = 0,
  Any = 1,
  Last = 2,
}

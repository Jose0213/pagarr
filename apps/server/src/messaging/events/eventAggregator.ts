import type { IEvent } from "./iEvent.js";
import type { IHandle, IHandleAsync } from "./iHandle.js";
import type { IEventAggregator } from "./iEventAggregator.js";
import { EventHandleOrder } from "../eventHandleOrder.js";

/**
 * Ported from NzbDrone.Core/Messaging/Events/EventAggregator.cs.
 *
 * ## The reflection problem and how this port adapts it
 *
 * C#'s `EventAggregator` is backed by a DI container (`IServiceFactory`):
 * the first time a given `TEvent` type is published, it reflects over the
 * container to discover every registered `IHandle<TEvent>`,
 * `IHandleAsync<TEvent>`, and `IHandleAsync<IEvent>` (the "global" handlers
 * that see every event, used sparingly in the real app -- e.g. for a
 * generic audit/logging sink) implementation, builds them, sorts the sync
 * ones by `EventHandleOrderAttribute`, and caches that `EventSubscribers<
 * TEvent>` bundle in a `Dictionary<string, object>` keyed by event type
 * name for subsequent publishes of the same event type.
 *
 * TypeScript has no DI container or reflection-based interface-implementer
 * scan (ruled out per PORT_PLAN.md -- "explicit over reflection", the same
 * precedent `decision-engine/createDefaultSpecifications.ts` set for
 * DecisionEngine's specification list). This port replaces the
 * container-scan step with **explicit registration**: callers call
 * `subscribe`/`subscribeAsync`/`subscribeGlobal` up front (typically once,
 * at application wiring time -- the equivalent of the DI container's
 * registration phase in C#, just performed by hand instead of a container
 * scanning assemblies) to build the same subscriber list the C# reflection
 * scan would have discovered. Everything downstream of that -- lookup by
 * event type, sync-then-async dispatch order, per-handler try/catch
 * isolation, EventHandleOrder sorting -- is ported behaviorally identical.
 *
 * ## Event identity
 *
 * C# keys its subscriber cache by `GetEventName(Type)` -- the event
 * class's simple name (with special handling for open generics, e.g.
 * `ModelEvent<Author>` -> `"ModelEvent<Author>"`). This port keys
 * subscriptions by the event **class/constructor reference** itself
 * (`EventCtor<TEvent>`) rather than a derived string: TS classes are real
 * runtime values (unlike C#'s reflection-only `Type` objects need a name
 * string to look up), so using the constructor directly as a Map key is
 * both simpler and strictly more precise than name-matching (no risk of
 * two same-named classes in different modules colliding, which the C#
 * approach is technically exposed to but never hits in practice since
 * Readarr's event class names are all unique within the process).
 *
 * ## Dispatch order (matches C# exactly)
 *
 * 1. Synchronous `IHandle<TEvent>` handlers, in `EventHandleOrder` order
 *    (First, then Any, then Last; stable within each tier, matching
 *    `.OrderBy(GetEventHandleOrder)`'s stable sort), called and awaited
 *    (not truly async, but the interface allows sync handlers to be
 *    trivially async -- see `iHandle.ts`) one after another, each wrapped
 *    in its own try/catch so one broken handler doesn't stop the rest
 *    (matches `broken_handler_should_not_effect_others_handler` in the C#
 *    test fixture).
 * 2. "Global" `IHandleAsync<IEvent>` handlers (see every event type),
 *    fired without waiting for completion (`Task.StartNew` in C#, a
 *    detached `.then()`/`.catch()` here).
 * 3. Regular `IHandleAsync<TEvent>` handlers, same fire-and-forget
 *    semantics.
 *
 * `PublishEvent` itself is synchronous in C# (it starts the async tasks
 * and returns immediately, not waiting for them) -- `publishEvent` here is
 * likewise synchronous, not `async`, preserving that "fire background work
 * and return" behavior exactly.
 */

/** Any event class's constructor -- used as the Map key for subscriber lookup. See module doc comment on "Event identity". */
export type EventCtor<TEvent extends IEvent> = new (...args: never[]) => TEvent;

interface SyncSubscription<TEvent extends IEvent> {
  handler: IHandle<TEvent>;
  order: EventHandleOrder;
}

export interface EventAggregatorOptions {
  /** Stand-in for NLog `_logger.Error(...)` calls -- see config/configService.ts's doc comment for this port's established "no NLog yet, plain optional callback" convention. Called once per handler that throws/rejects, matching C#'s per-handler catch-and-log (never rethrown to the publisher). */
  onError?: (eventName: string, handlerName: string, error: unknown) => void;
}

export class EventAggregator implements IEventAggregator {
  private readonly onError?: (eventName: string, handlerName: string, error: unknown) => void;

  private readonly syncHandlers = new Map<EventCtor<IEvent>, SyncSubscription<IEvent>[]>();
  private readonly asyncHandlers = new Map<EventCtor<IEvent>, IHandleAsync<IEvent>[]>();
  private readonly globalAsyncHandlers: IHandleAsync<IEvent>[] = [];

  constructor(options: EventAggregatorOptions = {}) {
    this.onError = options.onError;
  }

  /**
   * Ported from the DI container's discovery of `IHandle<TEvent>`
   * implementations -- explicit registration replaces the reflection scan
   * (see module doc comment). `order` mirrors `EventHandleOrderAttribute`
   * (defaults to `EventHandleOrder.Any`, same as an unmarked C# handler
   * method). Returns an unsubscribe function (not present in the C#
   * source -- C#'s DI-backed handler list is effectively static for the
   * app's lifetime; this port adds it since explicit registration makes
   * "register once at startup" a caller convention rather than something
   * enforced by the container, and tests benefit from being able to clean
   * up subscriptions between cases).
   */
  subscribe<TEvent extends IEvent>(
    eventType: EventCtor<TEvent>,
    handler: IHandle<TEvent>,
    order: EventHandleOrder = EventHandleOrder.Any
  ): () => void {
    const key = eventType as EventCtor<IEvent>;
    const list = this.syncHandlers.get(key) ?? [];
    const subscription: SyncSubscription<IEvent> = {
      handler,
      order,
    };
    list.push(subscription);
    list.sort((a, b) => a.order - b.order);
    this.syncHandlers.set(key, list);

    return () => {
      const current = this.syncHandlers.get(key);
      if (!current) {
        return;
      }
      const index = current.indexOf(subscription);
      if (index !== -1) {
        current.splice(index, 1);
      }
    };
  }

  /** Ported from the DI container's discovery of `IHandleAsync<TEvent>` implementations. See `subscribe`'s doc comment. */
  subscribeAsync<TEvent extends IEvent>(
    eventType: EventCtor<TEvent>,
    handler: IHandleAsync<TEvent>
  ): () => void {
    const key = eventType as EventCtor<IEvent>;
    const asyncHandler = handler as IHandleAsync<IEvent>;
    const list = this.asyncHandlers.get(key) ?? [];
    list.push(asyncHandler);
    this.asyncHandlers.set(key, list);

    return () => {
      const current = this.asyncHandlers.get(key);
      if (!current) {
        return;
      }
      const index = current.indexOf(asyncHandler);
      if (index !== -1) {
        current.splice(index, 1);
      }
    };
  }

  /** Ported from the DI container's discovery of `IHandleAsync<IEvent>` "global" implementations (handlers that see every published event). See `subscribe`'s doc comment. */
  subscribeGlobal(handler: IHandleAsync<IEvent>): () => void {
    this.globalAsyncHandlers.push(handler);

    return () => {
      const index = this.globalAsyncHandlers.indexOf(handler);
      if (index !== -1) {
        this.globalAsyncHandlers.splice(index, 1);
      }
    };
  }

  /**
   * Ported from `EventAggregator.PublishEvent<TEvent>`. Synchronous
   * handlers run first (in EventHandleOrder), each isolated by try/catch;
   * global async handlers and per-type async handlers are then fired
   * without being awaited (matching C#'s detached `Task.StartNew(...)`).
   */
  publishEvent<TEvent extends IEvent>(event: TEvent): void {
    const key = event.constructor as EventCtor<IEvent>;
    const eventName = key.name;

    const syncSubscriptions = this.syncHandlers.get(key) ?? [];
    for (const { handler } of syncSubscriptions) {
      try {
        handler.handle(event);
      } catch (e) {
        this.reportError(eventName, handler, e);
      }
    }

    for (const handler of this.globalAsyncHandlers) {
      this.fireAsync(eventName, handler, event);
    }

    const asyncSubscriptions = this.asyncHandlers.get(key) ?? [];
    for (const handler of asyncSubscriptions) {
      this.fireAsync(eventName, handler, event);
    }
  }

  private fireAsync(eventName: string, handler: IHandleAsync<IEvent>, event: IEvent): void {
    try {
      const result = handler.handleAsync(event);
      if (result instanceof Promise) {
        result.catch((e: unknown) => {
          this.reportError(eventName, handler, e);
        });
      }
    } catch (e) {
      this.reportError(eventName, handler, e);
    }
  }

  private reportError(eventName: string, handler: unknown, error: unknown): void {
    const handlerName =
      handler && typeof handler === "object" ? handler.constructor.name : String(handler);
    this.onError?.(eventName, handlerName, error);
  }
}

/** No-op aggregator, same role as db/events.ts's NullEventAggregator: usable wherever an `IEventAggregator` is optional and no subscribers exist. */
export class NullEventAggregator implements IEventAggregator {
  publishEvent(): void {
    // Intentional no-op.
  }
}

import type { IEvent } from "./iEvent.js";

/**
 * Ported from NzbDrone.Core/Messaging/Events/IEventAggregator.cs.
 *
 * NOTE for the eventual reconciliation pass (see this module's final
 * report, not performed here per task constraints): this is a *different,
 * wider* interface than `db/events.ts`'s `IEventAggregator`. That one is a
 * narrow Phase-0 stand-in typed only for `ModelEvent<TModel>`
 * (BasicRepository's row-level Created/Updated/Deleted notifications) --
 * see that file's own doc comment, which explicitly says a real aggregator
 * "implementing this interface" can be swapped in once Messaging lands.
 * This `IEventAggregator` is the real, general C# shape: `PublishEvent<
 * TEvent>(TEvent @event) where TEvent : class, IEvent` -- generic over
 * *any* event type, not just `ModelEvent`. `ModelEvent<TModel>` itself
 * structurally satisfies `IEvent` (it's just a plain object), so this
 * wider `IEventAggregator.publishEvent` can accept anything
 * `db/events.ts`'s narrower one could -- but the reverse isn't true, and
 * the two interfaces are structurally different shapes (this one isn't
 * generic-constrained the same way), so nothing here can retroactively
 * "become" `db/events.ts`'s type without editing that already-merged file,
 * which is out of scope for this port (see task constraints). A human
 * doing the reconciliation pass can decide whether `db/events.ts` and
 * every repository's `eventAggregator?: IEventAggregator` constructor
 * param should be repointed at this real one, or kept separate.
 */
export interface IEventAggregator {
  publishEvent<TEvent extends IEvent>(event: TEvent): void;
}

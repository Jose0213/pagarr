import type { CustomFormat } from "./customFormat.js";

/**
 * Ported from NzbDrone.Core/CustomFormats/Events/CustomFormatAddedEvent.cs
 * and CustomFormatDeletedEvent.cs.
 *
 * C#'s events implemented the Messaging module's `IEvent` marker interface
 * and were dispatched through `IEventAggregator.PublishEvent` (constructor
 * injected, Phase 4 -- not yet ported). Same deviation as
 * `books/events.ts`'s `IBooksEventAggregator`/`NullBooksEventAggregator`
 * (the precedent this file follows exactly): plain data classes for the
 * events themselves, plus a narrow `ICustomFormatEventAggregator` publish
 * contract and a no-op default aggregator. `QualityProfileService` (Profiles
 * module, Phase 1) already has `handleCustomFormatAdded`/
 * `handleCustomFormatDeleted` methods -- the real C# equivalent of
 * `QualityProfileService.Handle(CustomFormatAddedEvent)` /
 * `Handle(CustomFormatDeletedEvent)`. Wiring an aggregator whose
 * `publishEvent` calls those two methods is left to application-composition
 * code (out of this module's scope), same as db/events.ts leaves real
 * ModelEvent wiring to whoever assembles services.
 */
export class CustomFormatAddedEvent {
  constructor(public readonly customFormat: CustomFormat) {}
}

export class CustomFormatDeletedEvent {
  constructor(public readonly customFormat: CustomFormat) {}
}

export type CustomFormatDomainEvent = CustomFormatAddedEvent | CustomFormatDeletedEvent;

/** Ported narrowing of db/events.ts's IEventAggregator to this module's domain event union. */
export interface ICustomFormatEventAggregator {
  publishEvent(event: CustomFormatDomainEvent): void;
}

/** No-op aggregator, same role as db/events.ts's NullEventAggregator: usable until Messaging (Phase 4) lands. */
export class NullCustomFormatEventAggregator implements ICustomFormatEventAggregator {
  publishEvent(): void {
    // Intentional no-op.
  }
}

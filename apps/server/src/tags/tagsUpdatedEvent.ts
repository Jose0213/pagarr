/**
 * Ported from NzbDrone.Core/Tags/TagsUpdatedEvent.cs.
 *
 * C#'s `TagsUpdatedEvent : IEvent` is a bare marker event with no payload,
 * published via `IEventAggregator.PublishEvent` (Messaging module, not yet
 * ported -- Phase 4 per PORT_PLAN.md) whenever a tag is added, updated, or
 * deleted. Kept as a marker class here for shape-fidelity; TagService takes
 * a plain callback instead of a real event bus for now (see tagService.ts's
 * module doc comment for why, matching the precedent set by
 * config/configService.ts's `onConfigSaved`).
 */
export class TagsUpdatedEvent {}

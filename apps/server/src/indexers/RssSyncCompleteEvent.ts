/**
 * Ported from NzbDrone.Core/Indexers/RssSyncCompleteEvent.cs.
 *
 * FORWARD-REFERENCE NARROWING: C#'s `ProcessedDecisions` payload
 * (NzbDrone.Core.Download) belongs to the not-yet-ported DecisionEngine/
 * Download modules (see rssSyncService.ts's doc comment for the full
 * dependency chain this event sits at the end of). Kept as a marker class
 * with an `unknown`-typed payload slot for shape-fidelity, matching the
 * `IEvent` Messaging-deferral precedent (tags/tagsUpdatedEvent.ts) -- a
 * later phase porting Download/DecisionEngine can tighten
 * `processedDecisions`'s type without changing this event's shape.
 */
export class RssSyncCompleteEvent {
  constructor(public readonly processedDecisions: unknown) {}
}

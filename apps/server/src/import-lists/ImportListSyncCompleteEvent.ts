import type { Book } from "../books/models.js";
import type { IEvent } from "../messaging/events/iEvent.js";

/**
 * Ported from NzbDrone.Core/ImportLists/ImportListSyncCompleteEvent.cs.
 * `IEvent` here is the REAL `messaging/events/iEvent.ts` marker type.
 */
export class ImportListSyncCompleteEvent implements IEvent {
  constructor(readonly processedDecisions: Book[]) {}
}

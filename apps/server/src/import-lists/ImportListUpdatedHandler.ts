import type { IHandle } from "../messaging/events/iHandle.js";
import type { IManageCommandQueue } from "../messaging/commands/commandQueueManager.js";
import { ProviderAddedEvent } from "../thingi-provider/events/ProviderAddedEvent.js";
import { ProviderUpdatedEvent } from "../thingi-provider/events/ProviderUpdatedEvent.js";
import type { IImportListSettings } from "./IImportListSettings.js";
import { ImportListSyncCommand } from "./ImportListSyncCommand.js";

/**
 * Ported from NzbDrone.Core/ImportLists/ImportListUpdatedHandler.cs.
 *
 * `IHandle<ProviderUpdatedEvent<IImportList>>` / `IHandle<ProviderAddedEvent
 * <IImportList>>` -- the REAL `thingi-provider/events/*` event types (per
 * this module's task brief). Ported as a class with plain `handle*` methods
 * a caller wires up explicitly via the real `EventAggregator.subscribe()`
 * (matching this port's established "define the seam now, wire the real
 * bus explicitly" pattern -- Messaging now exists, unlike when
 * `notifications/`'s own event-consuming pieces were narrowed).
 */
export class ImportListUpdatedHandler
  implements
    IHandle<ProviderUpdatedEvent<IImportListSettings>>,
    IHandle<ProviderAddedEvent<IImportListSettings>>
{
  constructor(private readonly commandQueueManager: IManageCommandQueue) {}

  handle(
    message: ProviderUpdatedEvent<IImportListSettings> | ProviderAddedEvent<IImportListSettings>
  ): void {
    this.commandQueueManager.push(new ImportListSyncCommand(message.definition.id));
  }
}

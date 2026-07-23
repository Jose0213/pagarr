import type { IProviderConfig } from "../IProviderConfig.js";
import type { ProviderDefinition } from "../ProviderDefinition.js";

/**
 * Ported from NzbDrone.Core/ThingiProvider/Events/ProviderAddedEvent.cs.
 *
 * C#'s `IEvent` marker interface (from the not-yet-ported
 * `NzbDrone.Common.Messaging`/`NzbDrone.Core.Messaging.Events` event-bus
 * module) has no equivalent here yet -- these classes are plain data
 * carriers a future `IEventAggregator.publishEvent()` implementation can
 * consume once Messaging is ported, matching how `db/events.ts`'s
 * `ModelEvent`/`IEventAggregator` already stubbed the same seam for
 * BasicRepository.
 */
export class ProviderAddedEvent<TProviderConfig extends IProviderConfig = IProviderConfig> {
  readonly definition: ProviderDefinition<TProviderConfig>;

  constructor(definition: ProviderDefinition<TProviderConfig>) {
    this.definition = definition;
  }
}
